const $ = (id) => document.getElementById(id);

const state = {
  items: [],
  batches: {},
  view: 'cards',          // 'cards' | 'table'
  query: '',
  sort: 'newest',
  activeTags: new Set(),
  activeDomains: new Set(),
  activeBatch: null,      // collection id, or null
  time: 'all',            // 'all' | 'today' | 'week' | 'month'
  day: null,              // 'YYYY-MM-DD' from a calendar click; overrides `time`
  selected: new Set(),
  collapsed: new Set(),  // collapsed group ids in Groups view
  editingId: null,
  showDomains: false,
  showTags: true,
  calendarOpen: false
};

const TIME_LABELS = { today: 'Today', week: 'This week', month: 'This month' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let toastTimer = null;
// Writes the dashboard makes itself fire storage.onChanged too; these counters
// let the listener ignore our own echoes and only re-render on external saves.
let selfItemWrites = 0;
let selfBatchWrites = 0;

/* ---------- helpers ---------- */

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function persistItems() {
  selfItemWrites++;
  await rtSetItems(state.items);
}

async function persistBatches() {
  selfBatchWrites++;
  await rtSetBatches(state.batches);
}

function relativeDate(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function faviconHtml(item, cls) {
  if (item.favIconUrl && /^https?:\/\//.test(item.favIconUrl)) {
    return `<img class="${cls}" src="${escapeHtml(item.favIconUrl)}" alt="" loading="lazy"
      data-fallback="${escapeHtml((item.domain || item.title || '?')[0])}">`;
  }
  return cls === 't-favicon' ? '' : fallbackBadge(item);
}

function fallbackBadge(item) {
  const letter = (item.domain || item.title || '?')[0];
  return `<span class="favicon-fallback">${escapeHtml(letter)}</span>`;
}

// MV3 CSP forbids inline onerror handlers, so swap broken favicons here.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.fallback !== undefined) {
    if (img.classList.contains('t-favicon')) {
      img.remove();
    } else {
      const span = document.createElement('span');
      span.className = 'favicon-fallback';
      span.textContent = img.dataset.fallback;
      img.replaceWith(span);
    }
  }
}, true);

/* ---------- filtering & sorting ---------- */

function timeBounds() {
  if (state.day) {
    const start = new Date(`${state.day}T00:00:00`).getTime();
    return [start, start + 86400000];
  }
  const now = Date.now();
  if (state.time === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return [d.getTime(), Infinity];
  }
  if (state.time === 'week') return [now - 7 * 86400000, Infinity];
  if (state.time === 'month') return [now - 30 * 86400000, Infinity];
  return [-Infinity, Infinity];
}

function anyFilterActive() {
  return !!(state.query || state.activeTags.size || state.activeDomains.size ||
    state.activeBatch || state.time !== 'all' || state.day);
}

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  const [from, to] = timeBounds();
  const items = state.items.filter((item) => {
    if (state.activeBatch && item.batchId !== state.activeBatch) return false;
    if (state.activeTags.size && !item.tags.some((t) => state.activeTags.has(t))) return false;
    if (state.activeDomains.size && !state.activeDomains.has(item.domain)) return false;
    if (item.savedAt < from || item.savedAt >= to) return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      item.domain.toLowerCase().includes(q) ||
      (item.note || '').toLowerCase().includes(q) ||
      item.tags.some((t) => t.includes(q))
    );
  });

  const sorters = {
    newest: (a, b) => b.savedAt - a.savedAt,
    oldest: (a, b) => a.savedAt - b.savedAt,
    title: (a, b) => a.title.localeCompare(b.title),
    domain: (a, b) => a.domain.localeCompare(b.domain) || b.savedAt - a.savedAt
  };
  return items.sort(sorters[state.sort] || sorters.newest);
}

function batchCounts() {
  const m = new Map();
  for (const it of state.items) if (it.batchId) m.set(it.batchId, (m.get(it.batchId) || 0) + 1);
  return m;
}

function batchName(b) {
  if (!b) return 'Ungrouped';
  if (b.label) return b.label;
  if (b.source === 'all') return 'All windows';
  if (b.source === 'space') return 'Space';
  return 'Window';
}

function batchIcon(b) {
  if (!b) return '◌';
  if (b.source === 'all') return '⊞';
  if (b.source === 'space') return '✦';
  return '▤';
}

// <option> list of spaces for the move / edit selects. Window & "all" collections
// only appear while they still hold items; user-made spaces always appear.
function spaceOptions(selectedId) {
  const counts = batchCounts();
  return Object.values(state.batches)
    .filter((b) => b.source === 'space' || counts.get(b.id) > 0)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((b) => `<option value="${b.id}" ${selectedId === b.id ? 'selected' : ''}>${escapeHtml(batchName(b))}</option>`)
    .join('');
}

/* ---------- rendering ---------- */

function renderStats() {
  const items = state.items;
  $('statTotal').textContent = items.length;
  $('statDomains').textContent = new Set(items.map((i) => i.domain).filter(Boolean)).size;
  $('statTags').textContent = new Set(items.flatMap((i) => i.tags)).size;
  const weekAgo = Date.now() - 7 * 86400000;
  $('statWeek').textContent = items.filter((i) => i.savedAt > weekAgo).length;
}

function renderCollections() {
  const counts = batchCounts();
  const list = Object.values(state.batches)
    .filter((b) => counts.get(b.id) > 0)
    .sort((a, b) => b.savedAt - a.savedAt);

  $('collectionsLine').hidden = list.length === 0;
  $('collectionsBar').innerHTML = list.map((b) => {
    const n = counts.get(b.id);
    const icon = b.source === 'all' ? '⊞' : '▤';
    const label = b.label || (b.source === 'all' ? 'All windows' : 'Window');
    const active = state.activeBatch === b.id;
    return `<span class="coll-chip ${active ? 'active' : ''}">
      <button class="coll-main" data-batch="${b.id}" title="${escapeHtml(label)} — saved ${relativeDate(b.savedAt)}">
        <span class="coll-icon">${icon}</span>
        <span class="coll-label">${escapeHtml(label)}</span>
        <span class="coll-meta">${n} · ${relativeDate(b.savedAt)}</span>
      </button>
      <button class="coll-del" data-batch-del="${b.id}" title="Delete this collection and its ${n} item${n === 1 ? '' : 's'}">✕</button>
    </span>`;
  }).join('');
}

function renderDomainBar() {
  const counts = new Map();
  for (const it of state.items) if (it.domain) counts.set(it.domain, (counts.get(it.domain) || 0) + 1);
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  $('domainBar').innerHTML = domains
    .map(([d, n]) =>
      `<button class="tag-chip ${state.activeDomains.has(d) ? 'active' : ''}" data-domain="${escapeHtml(d)}">
        ${escapeHtml(d)} · ${n}
      </button>`)
    .join('') || '<span class="facet-empty">No domains yet</span>';
}

function renderTagBar() {
  const counts = new Map();
  for (const item of state.items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) || 0) + 1);

  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  $('tagBar').innerHTML = tags
    .map(([tag, n]) =>
      `<button class="tag-chip ${state.activeTags.has(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
        #${escapeHtml(tag)} · ${n}
      </button>`)
    .join('') || '<span class="facet-empty">No tags yet</span>';
}

function pill(remove, label) {
  return `<button class="af-chip" data-remove="${escapeHtml(remove)}">${escapeHtml(label)} <span class="af-x">✕</span></button>`;
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(pill('query', `“${state.query}”`));
  if (state.activeBatch) {
    const b = state.batches[state.activeBatch];
    const label = b ? (b.label || (b.source === 'all' ? 'All windows' : 'Window')) : 'Collection';
    chips.push(pill('batch', `🗂 ${label}`));
  }
  state.activeTags.forEach((t) => chips.push(pill(`tag:${t}`, `#${t}`)));
  state.activeDomains.forEach((d) => chips.push(pill(`domain:${d}`, d)));
  if (state.day) chips.push(pill('time', `on ${state.day}`));
  else if (state.time !== 'all') chips.push(pill('time', TIME_LABELS[state.time]));

  $('activeFilters').hidden = chips.length === 0;
  $('activeFiltersChips').innerHTML = chips.join('');
}

function renderCalendar() {
  if (!state.calendarOpen) return;
  const counts = new Map();
  for (const it of state.items) {
    const k = dayKey(it.savedAt);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const max = Math.max(1, ...counts.values());

  const WEEKS = 26;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startSunday = new Date(today);
  startSunday.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7);

  let cols = '';
  let months = '';
  let prevMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = new Date(startSunday);
    weekStart.setDate(startSunday.getDate() + w * 7);
    const m = weekStart.getMonth();
    months += `<span class="cal-month">${m !== prevMonth ? MONTHS[m] : ''}</span>`;
    prevMonth = m;

    let cells = '';
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(startSunday);
      d.setDate(startSunday.getDate() + w * 7 + dow);
      if (d > today) { cells += '<i class="cal-cell cal-empty"></i>'; continue; }
      const k = dayKey(d.getTime());
      const n = counts.get(k) || 0;
      const lv = n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
      const active = state.day === k ? ' active' : '';
      const label = `${n} item${n === 1 ? '' : 's'} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      cells += `<i class="cal-cell lv${lv}${active}" data-day="${k}" title="${label}"></i>`;
    }
    cols += `<div class="cal-col">${cells}</div>`;
  }

  $('calendarHeatmap').innerHTML =
    `<div class="cal-monthrow">${months}</div><div class="cal-grid">${cols}</div>`;
}

function cardHtml(item, i) {
  return `
      <article class="card" data-id="${item.id}" style="--i:${Math.min(i, 20)}" tabindex="0"
        title="${escapeHtml(item.url)}">
        <div class="card-head">
          ${faviconHtml(item, 'card-favicon')}
          <div class="card-titles">
            <div class="card-title">${escapeHtml(item.title)}</div>
            <div class="card-domain">${escapeHtml(item.domain)}</div>
          </div>
        </div>
        ${item.note ? `<p class="card-note">${escapeHtml(item.note)}</p>` : ''}
        ${item.tags.length ? `<div class="card-tags">${item.tags.map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="card-foot">
          <span class="card-date">${relativeDate(item.savedAt)}</span>
          <span class="card-actions">
            <button class="card-action" data-act="open" title="Open page">↗</button>
            <button class="card-action" data-act="edit" title="Edit">✎</button>
            <button class="card-action delete" data-act="delete" title="Delete">✕</button>
          </span>
        </div>
      </article>`;
}

function renderCards(items) {
  $('cardsGrid').innerHTML = items.map((item, i) => cardHtml(item, i)).join('');
}

function renderGroups(items) {
  // Group the (already filtered/sorted) items by their space.
  const groups = new Map();
  for (const it of items) {
    const key = it.batchId && state.batches[it.batchId] ? it.batchId : '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const order = [...groups.keys()]
    .filter((k) => k !== '__none__')
    .sort((a, b) => (state.batches[b]?.savedAt || 0) - (state.batches[a]?.savedAt || 0));
  if (groups.has('__none__')) order.push('__none__');

  $('groupsWrap').innerHTML = order.map((key) => {
    const list = groups.get(key);
    const b = key === '__none__' ? null : state.batches[key];
    const collapsed = state.collapsed.has(key);
    const meta = b ? `${list.length} item${list.length === 1 ? '' : 's'} · ${relativeDate(b.savedAt)}`
      : `${list.length} item${list.length === 1 ? '' : 's'}`;
    return `
      <section class="group" data-group="${key}">
        <header class="group-head">
          <button class="group-collapse" data-group-toggle="${key}" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▸' : '▾'}</button>
          <span class="group-icon">${batchIcon(b)}</span>
          <span class="group-name" data-group-name="${key}">${escapeHtml(batchName(b))}</span>
          ${key !== '__none__' ? `<button class="group-rename" data-group-rename="${key}" title="Rename space">✎</button>` : ''}
          <span class="group-meta">${meta}</span>
          <span class="group-actions">
            <button class="btn-soft sm" data-group-open="${key}">↗ Open all</button>
            ${key !== '__none__' ? `<button class="btn-soft sm danger" data-group-del="${key}">Delete</button>` : ''}
          </span>
        </header>
        ${collapsed ? '' : `<div class="cards-grid group-grid">${list.map((it, i) => cardHtml(it, i)).join('')}</div>`}
      </section>`;
  }).join('');
}

function renderTable(items) {
  $('tableBody').innerHTML = items
    .map((item) => `
      <tr data-id="${item.id}">
        <td class="col-check"><input type="checkbox" data-act="select" ${state.selected.has(item.id) ? 'checked' : ''}></td>
        <td><span class="t-title">${faviconHtml(item, 't-favicon')}
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></span></td>
        <td class="t-domain">${escapeHtml(item.domain)}</td>
        <td>${item.tags.map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join(' ')}</td>
        <td class="t-note" title="${escapeHtml(item.note)}">${escapeHtml(item.note) || '—'}</td>
        <td class="t-date">${relativeDate(item.savedAt)}</td>
        <td class="col-actions">
          <button class="card-action" data-act="edit" title="Edit">✎</button>
          <button class="card-action delete" data-act="delete" title="Delete">✕</button>
        </td>
      </tr>`)
    .join('');
  $('checkAll').checked = items.length > 0 && items.every((i) => state.selected.has(i.id));
}

function render() {
  const items = visibleItems();
  renderStats();
  renderCollections();
  renderDomainBar();
  renderTagBar();
  renderActiveFilters();

  $('domainsLine').hidden = !state.showDomains;
  $('tagsLine').hidden = !state.showTags;
  $('statDomainsBtn').classList.toggle('active', state.showDomains);
  $('statTagsBtn').classList.toggle('active', state.showTags);
  $('statWeekBtn').classList.toggle('active', state.time === 'week' && !state.day);
  syncTimeSelect();

  $('calendarPanel').hidden = !state.calendarOpen;
  $('calendarToggle').classList.toggle('active', state.calendarOpen);
  renderCalendar();

  const isEmpty = items.length === 0;
  const hasFilters = anyFilterActive();

  $('emptyState').hidden = !isEmpty;
  if (isEmpty) {
    $('emptyTitle').textContent = hasFilters ? 'Nothing matches' : 'No research yet';
    $('emptyText').innerHTML = hasFilters
      ? 'Try a different search, time range, or clear your filters.'
      : 'Click the extension icon on any page to start capturing tabs, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.';
  }

  $('cardsGrid').hidden = state.view !== 'cards' || isEmpty;
  $('tableWrap').hidden = state.view !== 'table' || isEmpty;
  $('groupsWrap').hidden = state.view !== 'groups' || isEmpty;
  if (state.view === 'cards') renderCards(items);
  else if (state.view === 'table') renderTable(items);
  else renderGroups(items);

  renderBulkBar();
}

// The time range lives in the toolbar dropdown (the conventional spot). A
// calendar-day pick is more specific than any preset, so we surface it as a
// transient "Calendar day" option rather than letting a preset look selected.
function syncTimeSelect() {
  const sel = $('timeSelect');
  let dayOpt = sel.querySelector('option[value="__day__"]');
  if (state.day) {
    if (!dayOpt) { dayOpt = new Option('Calendar day', '__day__'); sel.appendChild(dayOpt); }
    sel.value = '__day__';
  } else {
    if (dayOpt) dayOpt.remove();
    sel.value = state.time;
  }
}

function renderBulkBar() {
  const n = state.selected.size;
  $('bulkBar').hidden = n === 0 || state.view !== 'table';
  $('bulkCount').textContent = `${n} selected`;
}

/* ---------- confirm dialog ---------- */

let confirmResolver = null;

function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Delete', danger = true }) {
  $('confirmTitle').textContent = title;
  $('confirmMessage').textContent = message;
  const ok = $('confirmOk');
  ok.textContent = confirmLabel;
  ok.className = danger ? 'btn-danger' : 'btn-save';
  $('confirmModal').showModal();
  ok.focus();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function resolveConfirm(value) {
  $('confirmModal').close();
  if (confirmResolver) { confirmResolver(value); confirmResolver = null; }
}

$('confirmOk').addEventListener('click', () => resolveConfirm(true));
$('confirmCancel').addEventListener('click', () => resolveConfirm(false));
$('confirmModal').addEventListener('cancel', (e) => { e.preventDefault(); resolveConfirm(false); });

/* ---------- mutations ---------- */

async function deleteItems(ids) {
  state.items = state.items.filter((i) => !ids.includes(i.id));
  ids.forEach((id) => state.selected.delete(id));
  await persistItems();
  render();
  showToast(ids.length === 1 ? 'Item deleted' : `${ids.length} items deleted`);
}

async function requestDeleteItems(ids) {
  if (!ids.length) return;
  const n = ids.length;
  const ok = await confirmDialog({
    title: n === 1 ? 'Delete item?' : `Delete ${n} items?`,
    message: n === 1
      ? 'This removes it from your research. This can’t be undone.'
      : `This removes ${n} items from your research. This can’t be undone.`,
    confirmLabel: n === 1 ? 'Delete' : `Delete ${n}`
  });
  if (ok) await deleteItems(ids);
}

function openEditModal(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  state.editingId = id;
  $('editTitle').value = item.title;
  $('editTags').value = item.tags.join(', ');
  $('editNote').value = item.note || '';
  $('editSpace').innerHTML = `<option value="">— Ungrouped —</option>${spaceOptions(item.batchId)}`;
  $('editModal').showModal();
}

function clearAllFilters() {
  state.query = '';
  $('searchInput').value = '';
  state.activeTags.clear();
  state.activeDomains.clear();
  state.activeBatch = null;
  state.time = 'all';
  state.day = null;
  render();
}

/* ---------- export ---------- */

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  download('research-tracker.json', 'application/json', JSON.stringify(visibleItems(), null, 2));
  showToast('Exported JSON');
}

function exportCsv() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = visibleItems().map((i) =>
    [i.title, i.url, i.domain, i.tags.join('; '), i.note, new Date(i.savedAt).toISOString()].map(esc).join(','));
  download('research-tracker.csv', 'text/csv', ['Title,URL,Domain,Tags,Note,Saved At', ...rows].join('\n'));
  showToast('Exported CSV');
}

/* ---------- events: items ---------- */

function handleItemAction(e) {
  const actEl = e.target.closest('[data-act]');
  const row = e.target.closest('[data-id]');
  if (!row) return;
  const id = row.dataset.id;

  if (actEl) {
    const act = actEl.dataset.act;
    if (act === 'open') {
      const item = state.items.find((i) => i.id === id);
      if (item) chrome.tabs.create({ url: item.url, active: false });
    } else if (act === 'edit') {
      openEditModal(id);
    } else if (act === 'delete') {
      requestDeleteItems([id]);
    } else if (act === 'select') {
      actEl.checked ? state.selected.add(id) : state.selected.delete(id);
      renderBulkBar();
      const items = visibleItems();
      $('checkAll').checked = items.length > 0 && items.every((i) => state.selected.has(i.id));
    }
    return;
  }

  // Clicking a card (not a button/link inside it) opens the page.
  if ((state.view === 'cards' || state.view === 'groups') && !e.target.closest('a')) {
    const item = state.items.find((i) => i.id === id);
    if (item) chrome.tabs.create({ url: item.url, active: false });
  }
}

function handleCardKeydown(e) {
  if (e.key === 'Enter' && e.target.classList.contains('card')) {
    const item = state.items.find((i) => i.id === e.target.dataset.id);
    if (item) chrome.tabs.create({ url: item.url, active: false });
  }
}

$('cardsGrid').addEventListener('click', handleItemAction);
$('tableBody').addEventListener('click', handleItemAction);
$('groupsWrap').addEventListener('click', handleItemAction);
$('cardsGrid').addEventListener('keydown', handleCardKeydown);
$('groupsWrap').addEventListener('keydown', handleCardKeydown);

/* ---------- events: groups view ---------- */

$('groupsWrap').addEventListener('click', async (e) => {
  const toggle = e.target.closest('[data-group-toggle]');
  if (toggle) {
    const k = toggle.dataset.groupToggle;
    state.collapsed.has(k) ? state.collapsed.delete(k) : state.collapsed.add(k);
    render();
    return;
  }

  const rename = e.target.closest('[data-group-rename]');
  if (rename) { startRename(rename.dataset.groupRename); return; }

  const open = e.target.closest('[data-group-open]');
  if (open) {
    const k = open.dataset.groupOpen;
    const items = state.items.filter((i) => (k === '__none__' ? !i.batchId || !state.batches[i.batchId] : i.batchId === k));
    if (!items.length) return;
    if (items.length > 8) {
      const ok = await confirmDialog({
        title: `Open ${items.length} tabs?`,
        message: `This opens ${items.length} background tabs at once.`,
        confirmLabel: 'Open',
        danger: false
      });
      if (!ok) return;
    }
    items.forEach((i) => chrome.tabs.create({ url: i.url, active: false }));
    return;
  }

  const del = e.target.closest('[data-group-del]');
  if (del) await deleteCollection(del.dataset.groupDel);
});

function startRename(key) {
  const b = state.batches[key];
  const span = $('groupsWrap').querySelector(`[data-group-name="${key}"]`);
  if (!b || !span) return;
  const input = document.createElement('input');
  input.className = 'group-name-input';
  input.value = b.label || batchName(b);
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (v) { b.label = v; await persistBatches(); }
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { done = true; render(); }
  });
  input.addEventListener('blur', commit);
}

$('checkAll').addEventListener('change', (e) => {
  const items = visibleItems();
  if (e.target.checked) items.forEach((i) => state.selected.add(i.id));
  else items.forEach((i) => state.selected.delete(i.id));
  render();
});

/* ---------- events: bulk actions ---------- */

$('bulkDelete').addEventListener('click', () => requestDeleteItems([...state.selected]));
$('bulkClear').addEventListener('click', () => { state.selected.clear(); render(); });

$('bulkOpen').addEventListener('click', async () => {
  const ids = new Set(state.selected);
  const items = state.items.filter((i) => ids.has(i.id));
  if (!items.length) return;
  if (items.length > 8) {
    const ok = await confirmDialog({
      title: `Open ${items.length} tabs?`,
      message: `This opens ${items.length} background tabs at once.`,
      confirmLabel: 'Open',
      danger: false
    });
    if (!ok) return;
  }
  items.forEach((i) => chrome.tabs.create({ url: i.url, active: false }));
});

$('bulkTag').addEventListener('click', () => {
  if (!state.selected.size) return;
  $('bulkTagsInput').value = '';
  $('tagsModal').showModal();
  $('bulkTagsInput').focus();
});

$('tagsCancel').addEventListener('click', () => $('tagsModal').close());

$('tagsForm').addEventListener('submit', async () => {
  const add = rtParseTags($('bulkTagsInput').value);
  if (!add.length) return;
  const ids = new Set(state.selected);
  for (const it of state.items) {
    if (ids.has(it.id)) it.tags = [...new Set([...it.tags, ...add])];
  }
  await persistItems();
  render();
  showToast(`Tagged ${ids.size} item${ids.size === 1 ? '' : 's'}`);
});

$('bulkMove').addEventListener('click', () => {
  if (!state.selected.size) return;
  $('moveSelect').innerHTML =
    `<option value="">— Ungrouped —</option>${spaceOptions(null)}<option value="__new__">+ New space…</option>`;
  $('newSpaceRow').hidden = true;
  $('newSpaceName').value = '';
  $('moveModal').showModal();
});

$('moveSelect').addEventListener('change', (e) => {
  const isNew = e.target.value === '__new__';
  $('newSpaceRow').hidden = !isNew;
  if (isNew) $('newSpaceName').focus();
});

$('moveCancel').addEventListener('click', () => $('moveModal').close());

$('moveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let target = $('moveSelect').value;
  if (target === '__new__') {
    const name = $('newSpaceName').value.trim();
    if (!name) { $('newSpaceName').focus(); return; }
    target = rtNewId('space');
    state.batches[target] = { id: target, source: 'space', label: name, savedAt: Date.now(), count: 0 };
    await persistBatches();
  }
  const batchId = target || null;
  const ids = new Set(state.selected);
  for (const it of state.items) if (ids.has(it.id)) it.batchId = batchId;
  await persistItems();
  $('moveModal').close();
  render();
  showToast(`Moved ${ids.size} item${ids.size === 1 ? '' : 's'}`);
});

/* ---------- events: search / sort / view ---------- */

let searchTimer = null;
$('searchInput').addEventListener('input', (e) => {
  const value = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = value; render(); }, 120);
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    $('searchInput').focus();
  }
});

$('sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

$('viewCards').addEventListener('click', () => setView('cards'));
$('viewTable').addEventListener('click', () => setView('table'));
$('viewGroups').addEventListener('click', () => setView('groups'));

function setView(view) {
  state.view = view;
  $('viewCards').classList.toggle('active', view === 'cards');
  $('viewTable').classList.toggle('active', view === 'table');
  $('viewGroups').classList.toggle('active', view === 'groups');
  chrome.storage.local.set({ rtView: view });
  render();
}

/* ---------- events: facets & filters ---------- */

$('tagBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  state.activeTags.has(tag) ? state.activeTags.delete(tag) : state.activeTags.add(tag);
  render();
});

$('domainBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  const d = chip.dataset.domain;
  state.activeDomains.has(d) ? state.activeDomains.delete(d) : state.activeDomains.add(d);
  render();
});

async function deleteCollection(id) {
  const ids = state.items.filter((i) => i.batchId === id).map((i) => i.id);
  const b = state.batches[id];
  const ok = await confirmDialog({
    title: 'Delete space?',
    message: `This deletes “${batchName(b)}” and its ${ids.length} item${ids.length === 1 ? '' : 's'}. This can’t be undone.`,
    confirmLabel: 'Delete'
  });
  if (!ok) return;
  state.items = state.items.filter((i) => i.batchId !== id);
  delete state.batches[id];
  if (state.activeBatch === id) state.activeBatch = null;
  ids.forEach((x) => state.selected.delete(x));
  await persistItems();
  await persistBatches();
  render();
  showToast('Space deleted');
}

$('collectionsBar').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-batch-del]');
  if (del) { await deleteCollection(del.dataset.batchDel); return; }
  const main = e.target.closest('[data-batch]');
  if (main) {
    const id = main.dataset.batch;
    state.activeBatch = state.activeBatch === id ? null : id;
    render();
  }
});

$('timeSelect').addEventListener('change', (e) => {
  if (e.target.value === '__day__') return;  // synthetic option; ignore
  state.time = e.target.value;
  state.day = null;
  render();
});

$('statTotalBtn').addEventListener('click', clearAllFilters);
$('statDomainsBtn').addEventListener('click', () => { state.showDomains = !state.showDomains; render(); });
$('statTagsBtn').addEventListener('click', () => { state.showTags = !state.showTags; render(); });
$('statWeekBtn').addEventListener('click', () => { state.time = 'week'; state.day = null; render(); });

$('activeFiltersChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-remove]');
  if (!chip) return;
  const r = chip.dataset.remove;
  if (r === 'query') { state.query = ''; $('searchInput').value = ''; }
  else if (r === 'batch') state.activeBatch = null;
  else if (r === 'time') { state.time = 'all'; state.day = null; }
  else if (r.startsWith('tag:')) state.activeTags.delete(r.slice(4));
  else if (r.startsWith('domain:')) state.activeDomains.delete(r.slice(7));
  render();
});

$('clearFilters').addEventListener('click', clearAllFilters);

/* ---------- events: calendar ---------- */

$('calendarToggle').addEventListener('click', async () => {
  state.calendarOpen = !state.calendarOpen;
  await chrome.storage.local.set({ rtCalOpen: state.calendarOpen });
  render();
});

$('calendarHeatmap').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-day]');
  if (!cell) return;
  const k = cell.dataset.day;
  state.day = state.day === k ? null : k;
  if (state.day) state.time = 'all';
  render();
});

/* ---------- events: export menu ---------- */

$('exportBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('exportMenu').classList.toggle('open');
});
document.addEventListener('click', () => $('exportMenu').classList.remove('open'));
$('exportJson').addEventListener('click', exportJson);
$('exportCsv').addEventListener('click', exportCsv);

/* ---------- events: theme ---------- */

$('themeToggle').addEventListener('click', async () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  await chrome.storage.local.set({ [THEME_KEY]: next });
  try { localStorage.setItem('rtTheme', next); } catch (e) { /* ignore */ }
});

/* ---------- events: edit modal ---------- */

$('editForm').addEventListener('submit', async () => {
  const item = state.items.find((i) => i.id === state.editingId);
  if (item) {
    item.title = $('editTitle').value.trim() || item.title;
    item.tags = rtParseTags($('editTags').value);
    item.note = $('editNote').value.trim();
    item.batchId = $('editSpace').value || null;
    await persistItems();
    render();
    showToast('Saved changes');
  }
});

$('editCancel').addEventListener('click', () => $('editModal').close());

/* ---------- live sync ---------- */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let dirty = false;
  if (changes[STORE_KEY]) {
    if (selfItemWrites > 0) selfItemWrites--;
    else { state.items = changes[STORE_KEY].newValue || []; dirty = true; }
  }
  if (changes[BATCH_KEY]) {
    if (selfBatchWrites > 0) selfBatchWrites--;
    else { state.batches = changes[BATCH_KEY].newValue || {}; dirty = true; }
  }
  if (dirty) render();
});

/* ---------- init ---------- */

async function init() {
  const prefs = await chrome.storage.local.get([THEME_KEY, 'rtView', 'rtCalOpen']);
  if (prefs[THEME_KEY]) {
    document.documentElement.dataset.theme = prefs[THEME_KEY];
    try { localStorage.setItem('rtTheme', prefs[THEME_KEY]); } catch (e) { /* ignore */ }
  }
  if (['cards', 'table', 'groups'].includes(prefs.rtView)) {
    state.view = prefs.rtView;
    $('viewCards').classList.toggle('active', state.view === 'cards');
    $('viewTable').classList.toggle('active', state.view === 'table');
    $('viewGroups').classList.toggle('active', state.view === 'groups');
  }
  state.calendarOpen = prefs.rtCalOpen === true;

  state.items = await rtGetItems();
  state.batches = await rtGetBatches();

  // Drop collection records whose items have all been deleted.
  const counts = batchCounts();
  let pruned = false;
  for (const id of Object.keys(state.batches)) {
    if (!counts.get(id)) { delete state.batches[id]; pruned = true; }
  }
  if (pruned) await persistBatches();

  render();
}

init();

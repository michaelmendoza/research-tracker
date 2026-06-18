const $ = (id) => document.getElementById(id);

const state = {
  items: [],
  view: 'cards',          // 'cards' | 'table'
  query: '',
  sort: 'newest',
  activeTags: new Set(),
  selected: new Set(),
  editingId: null
};

let toastTimer = null;

/* ---------- helpers ---------- */

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  let items = state.items.filter((item) => {
    if (state.activeTags.size && !item.tags.some((t) => state.activeTags.has(t))) return false;
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

/* ---------- rendering ---------- */

function renderStats() {
  const items = state.items;
  $('statTotal').textContent = items.length;
  $('statDomains').textContent = new Set(items.map((i) => i.domain).filter(Boolean)).size;
  $('statTags').textContent = new Set(items.flatMap((i) => i.tags)).size;
  const weekAgo = Date.now() - 7 * 86400000;
  $('statWeek').textContent = items.filter((i) => i.savedAt > weekAgo).length;
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
    .join('');
}

function renderCards(items) {
  $('cardsGrid').innerHTML = items
    .map((item, i) => `
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
      </article>`)
    .join('');
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
  renderTagBar();

  const isEmpty = items.length === 0;
  const hasFilters = state.query || state.activeTags.size;

  $('emptyState').hidden = !isEmpty;
  if (isEmpty) {
    $('emptyTitle').textContent = hasFilters ? 'Nothing matches' : 'No research yet';
    $('emptyText').innerHTML = hasFilters
      ? 'Try a different search or clear your tag filters.'
      : 'Click the extension icon on any page to start capturing tabs, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.';
  }

  $('cardsGrid').hidden = state.view !== 'cards' || isEmpty;
  $('tableWrap').hidden = state.view !== 'table' || isEmpty;
  if (state.view === 'cards') renderCards(items);
  else renderTable(items);

  renderBulkBar();
}

function renderBulkBar() {
  const n = state.selected.size;
  $('bulkBar').hidden = n === 0 || state.view !== 'table';
  $('bulkCount').textContent = `${n} selected`;
}

/* ---------- mutations ---------- */

async function deleteItems(ids) {
  state.items = state.items.filter((i) => !ids.includes(i.id));
  ids.forEach((id) => state.selected.delete(id));
  await rtSetItems(state.items);
  render();
  showToast(ids.length === 1 ? 'Item deleted' : `${ids.length} items deleted`);
}

function openEditModal(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  state.editingId = id;
  $('editTitle').value = item.title;
  $('editTags').value = item.tags.join(', ');
  $('editNote').value = item.note || '';
  $('editModal').showModal();
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

/* ---------- events ---------- */

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
      deleteItems([id]);
    } else if (act === 'select') {
      actEl.checked ? state.selected.add(id) : state.selected.delete(id);
      renderBulkBar();
      const items = visibleItems();
      $('checkAll').checked = items.length > 0 && items.every((i) => state.selected.has(i.id));
    }
    return;
  }

  // Clicking a card (not a button/link inside it) opens the page.
  if (state.view === 'cards' && !e.target.closest('a')) {
    const item = state.items.find((i) => i.id === id);
    if (item) chrome.tabs.create({ url: item.url, active: false });
  }
}

$('cardsGrid').addEventListener('click', handleItemAction);
$('tableBody').addEventListener('click', handleItemAction);

$('cardsGrid').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('card')) {
    const item = state.items.find((i) => i.id === e.target.dataset.id);
    if (item) chrome.tabs.create({ url: item.url, active: false });
  }
});

$('checkAll').addEventListener('change', (e) => {
  const items = visibleItems();
  if (e.target.checked) items.forEach((i) => state.selected.add(i.id));
  else items.forEach((i) => state.selected.delete(i.id));
  render();
});

$('bulkDelete').addEventListener('click', () => deleteItems([...state.selected]));
$('bulkClear').addEventListener('click', () => { state.selected.clear(); render(); });

$('searchInput').addEventListener('input', (e) => { state.query = e.target.value; render(); });

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    $('searchInput').focus();
  }
});

$('sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

$('viewCards').addEventListener('click', () => setView('cards'));
$('viewTable').addEventListener('click', () => setView('table'));

function setView(view) {
  state.view = view;
  $('viewCards').classList.toggle('active', view === 'cards');
  $('viewTable').classList.toggle('active', view === 'table');
  chrome.storage.local.set({ rtView: view });
  render();
}

$('tagBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  state.activeTags.has(tag) ? state.activeTags.delete(tag) : state.activeTags.add(tag);
  render();
});

/* export menu */
$('exportBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('exportMenu').classList.toggle('open');
});
document.addEventListener('click', () => $('exportMenu').classList.remove('open'));
$('exportJson').addEventListener('click', exportJson);
$('exportCsv').addEventListener('click', exportCsv);

/* theme */
$('themeToggle').addEventListener('click', async () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  await chrome.storage.local.set({ [THEME_KEY]: next });
});

/* edit modal */
$('editForm').addEventListener('submit', async () => {
  const item = state.items.find((i) => i.id === state.editingId);
  if (item) {
    item.title = $('editTitle').value.trim() || item.title;
    item.tags = rtParseTags($('editTags').value);
    item.note = $('editNote').value.trim();
    await rtSetItems(state.items);
    render();
    showToast('Saved changes');
  }
});

$('editCancel').addEventListener('click', () => $('editModal').close());

/* live sync — reflect saves made from the popup/background while dashboard is open */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORE_KEY]) {
    state.items = changes[STORE_KEY].newValue || [];
    render();
  }
});

/* ---------- init ---------- */

async function init() {
  const prefs = await chrome.storage.local.get([THEME_KEY, 'rtView']);
  if (prefs[THEME_KEY]) document.documentElement.dataset.theme = prefs[THEME_KEY];
  if (prefs.rtView === 'table' || prefs.rtView === 'cards') {
    state.view = prefs.rtView;
    $('viewCards').classList.toggle('active', state.view === 'cards');
    $('viewTable').classList.toggle('active', state.view === 'table');
  }
  state.items = await rtGetItems();
  render();
}

init();

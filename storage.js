/**
 * Shared storage layer for Research Tracker.
 * Items live in chrome.storage.local under STORE_KEY as an array of:
 * { id, url, title, favIconUrl, domain, note, tags[], savedAt, batchId }
 */
const STORE_KEY = 'researchItems';
const THEME_KEY = 'rtTheme';

function rtDomainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function rtMakeItem(tab, { tags = [], note = '', batchId = null } = {}) {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    url: tab.url || '',
    title: tab.title || tab.url || 'Untitled',
    favIconUrl: tab.favIconUrl || '',
    domain: rtDomainOf(tab.url || ''),
    note,
    tags,
    savedAt: Date.now(),
    batchId
  };
}

async function rtGetItems() {
  const data = await chrome.storage.local.get(STORE_KEY);
  return Array.isArray(data[STORE_KEY]) ? data[STORE_KEY] : [];
}

async function rtSetItems(items) {
  await chrome.storage.local.set({ [STORE_KEY]: items });
}

function rtIsSavableUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

/**
 * Add tabs, skipping URLs already saved.
 * Returns { added, skipped }.
 */
async function rtAddTabs(tabs, opts = {}) {
  const items = await rtGetItems();
  const existing = new Set(items.map((i) => i.url));
  const fresh = [];
  let skipped = 0;
  for (const tab of tabs) {
    if (!rtIsSavableUrl(tab.url)) { skipped++; continue; }
    if (existing.has(tab.url)) { skipped++; continue; }
    existing.add(tab.url);
    fresh.push(rtMakeItem(tab, opts));
  }
  if (fresh.length) await rtSetItems([...fresh, ...items]);
  return { added: fresh.length, skipped };
}

function rtParseTags(raw) {
  return [...new Set(
    (raw || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  )];
}

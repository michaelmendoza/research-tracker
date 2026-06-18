/**
 * Shared storage layer for Research Tracker.
 * Items live in chrome.storage.local under STORE_KEY as an array of:
 * { id, url, title, favIconUrl, domain, note, tags[], savedAt, batchId }
 */
const STORE_KEY = 'researchItems';
const BATCH_KEY = 'researchBatches';
const THEME_KEY = 'rtTheme';

function rtDomainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function rtNewId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

async function rtGetBatches() {
  const data = await chrome.storage.local.get(BATCH_KEY);
  const b = data[BATCH_KEY];
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

async function rtSetBatches(batches) {
  await chrome.storage.local.set({ [BATCH_KEY]: batches });
}

function rtIsSavableUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

/**
 * Add tabs, skipping URLs already saved or that point at browser-internal pages.
 *
 * opts:
 *   tags, note           — applied to every new item
 *   batch: { source }    — when present, the newly-added items are grouped into a
 *                          named collection (a batch record is written to BATCH_KEY).
 *                          `source` is e.g. 'window' | 'all'.
 *
 * Returns { added, skipped, unsavable, batchId } where:
 *   skipped   = already in the library (true duplicate)
 *   unsavable = not an http(s) page (chrome://, etc.)
 *   batchId   = id of the collection created, or null
 */
async function rtAddTabs(tabs, opts = {}) {
  const { tags = [], note = '', batch = null } = opts;
  const items = await rtGetItems();
  const existing = new Set(items.map((i) => i.url));
  const batchId = batch ? rtNewId('batch') : null;

  const fresh = [];
  let skipped = 0;
  let unsavable = 0;
  for (const tab of tabs) {
    if (!rtIsSavableUrl(tab.url)) { unsavable++; continue; }
    if (existing.has(tab.url)) { skipped++; continue; }
    existing.add(tab.url);
    fresh.push(rtMakeItem(tab, { tags, note, batchId }));
  }

  if (fresh.length) {
    await rtSetItems([...fresh, ...items]);
    if (batch) {
      const batches = await rtGetBatches();
      batches[batchId] = {
        id: batchId,
        source: batch.source || 'window',
        label: batch.label || null,
        savedAt: Date.now(),
        count: fresh.length
      };
      await rtSetBatches(batches);
    }
  }

  return { added: fresh.length, skipped, unsavable, batchId: fresh.length ? batchId : null };
}

function rtParseTags(raw) {
  return [...new Set(
    (raw || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  )];
}

importScripts('storage.js');

const BADGE_ALARM = 'rt-clear-badge';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'rt-save-page',
    title: 'Save page to Research Tracker',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'rt-save-link',
    title: 'Save link to Research Tracker',
    contexts: ['link']
  });
});

/**
 * Pick badge text + color from a save result.
 *   added    → "+N" green      (newly saved)
 *   skipped  → "✓"  indigo     (already in your research)
 *   neither  → "–"  amber      (couldn't save, e.g. a chrome:// page)
 */
function badgeFor({ added, skipped }) {
  if (added) return { text: `+${added}`, color: '#10b981' };
  if (skipped) return { text: '✓', color: '#6366f1' };
  return { text: '–', color: '#f59e0b' };
}

async function flashBadge({ text, color }) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  // Fast path: clear ~2s later while the worker is still alive.
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  // Backstop: an alarm survives a worker teardown (Chrome clamps the delay to
  // ~30s), so the badge can never get permanently stuck if the timeout above
  // never fires because the service worker was suspended.
  chrome.alarms.create(BADGE_ALARM, { delayInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_ALARM) chrome.action.setBadgeText({ text: '' });
});

async function saveCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await flashBadge(badgeFor(await rtAddTabs([tab])));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'rt-save-page' && tab) {
    await flashBadge(badgeFor(await rtAddTabs([tab])));
  } else if (info.menuItemId === 'rt-save-link' && info.linkUrl) {
    const result = await rtAddTabs([{ url: info.linkUrl, title: info.selectionText || info.linkUrl }]);
    await flashBadge(badgeFor(result));
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-current-tab') {
    await saveCurrentTab();
  } else if (command === 'open-dashboard') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

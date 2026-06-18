importScripts('storage.js');

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

async function flashBadge(text, color = '#10b981') {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

async function saveCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const { added } = await rtAddTabs([tab]);
  await flashBadge(added ? '+1' : '✓', added ? '#10b981' : '#6366f1');
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'rt-save-page' && tab) {
    const { added } = await rtAddTabs([tab]);
    await flashBadge(added ? '+1' : '✓', added ? '#10b981' : '#6366f1');
  } else if (info.menuItemId === 'rt-save-link' && info.linkUrl) {
    const { added } = await rtAddTabs([{ url: info.linkUrl, title: info.selectionText || info.linkUrl }]);
    await flashBadge(added ? '+1' : '✓', added ? '#10b981' : '#6366f1');
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-current-tab') {
    await saveCurrentTab();
  } else if (command === 'open-dashboard') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

const $ = (id) => document.getElementById(id);

let currentTab = null;
let toastTimer = null;

function showToast(msg, success = true) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.toggle('success', success);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function captureOpts(batch = null) {
  return {
    tags: rtParseTags($('tagsInput').value),
    note: $('noteInput').value.trim(),
    batch
  };
}

function reportResult({ added, skipped, unsavable }) {
  if (added && skipped) showToast(`Saved ${added} · ${skipped} already saved`);
  else if (added) showToast(`Saved ${added === 1 ? 'tab' : added + ' tabs'} ✓`);
  else if (skipped) showToast('Already in your research', false);
  else if (unsavable) showToast('Nothing to save — browser pages can’t be saved', false);
  else showToast('Nothing to save', false);
  refreshCounts();
}

async function refreshCounts() {
  const items = await rtGetItems();
  $('itemCount').textContent = items.length;

  const windowTabs = await chrome.tabs.query({ currentWindow: true });
  const allTabs = await chrome.tabs.query({});
  $('windowCount').textContent = `(${windowTabs.filter((t) => rtIsSavableUrl(t.url)).length})`;
  $('allCount').textContent = `(${allTabs.filter((t) => rtIsSavableUrl(t.url)).length})`;
}

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (currentTab) {
    $('tabTitle').textContent = currentTab.title || 'Untitled';
    $('tabDomain').textContent = rtDomainOf(currentTab.url || '') || currentTab.url || '';
    const fav = $('tabFavicon');
    if (currentTab.favIconUrl) fav.src = currentTab.favIconUrl;
    else fav.style.visibility = 'hidden';

    if (!rtIsSavableUrl(currentTab.url)) {
      $('saveTab').disabled = true;
      $('saveTab').style.opacity = '0.5';
      $('tabDomain').textContent = 'This page can’t be saved (browser page)';
    }
  }

  await refreshCounts();
  $('tagsInput').focus();
}

$('saveTab').addEventListener('click', async () => {
  if (!currentTab) return;
  reportResult(await rtAddTabs([currentTab], captureOpts()));
});

$('saveWindow').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  reportResult(await rtAddTabs(tabs, captureOpts({ source: 'window' })));
});

$('saveAll').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({});
  reportResult(await rtAddTabs(tabs, captureOpts({ source: 'all' })));
});

$('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

// Enter in the tags field saves the current tab — fastest path.
$('tagsInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('saveTab').click();
});

init();

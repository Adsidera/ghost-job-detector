let refreshTimer = null;

function refreshSidePanel() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (globalThis.scanActiveTab) globalThis.scanActiveTab(true);
  }, 250);
}

chrome.tabs.onActivated.addListener(refreshSidePanel);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    refreshSidePanel();
  }
});

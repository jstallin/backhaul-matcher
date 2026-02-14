/**
 * Haul Monitor - Background Service Worker
 * Handles communication between content scripts and the Haul Monitor app
 */

// Configuration
const CONFIG = {
  haulMonitorUrl: 'https://haulmonitor.cloud',
  localUrl: 'http://localhost:5173'
};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Haul Monitor Background: Received message', message);

  switch (message.action) {
    case 'loadImported':
      handleLoadImported(message.load);
      sendResponse({ success: true });
      break;

    case 'loadsImported':
      handleLoadsImported(message.loads, message.count);
      sendResponse({ success: true });
      break;

    case 'getImportedLoads':
      chrome.storage.local.get(['importedLoads'], (result) => {
        sendResponse({ loads: result.importedLoads || [] });
      });
      return true; // Keep channel open for async response

    case 'clearImportedLoads':
      chrome.storage.local.set({ importedLoads: [] }, () => {
        updateBadge();
        sendResponse({ success: true });
      });
      return true;

    case 'exportToHaulMonitor':
      // Simply open the Haul Monitor app - user can view their loads there
      chrome.tabs.create({ url: CONFIG.haulMonitorUrl });
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }

  return false; // No async response needed for sync handlers
});

// Handle single load import
function handleLoadImported(load) {
  console.log('Haul Monitor: Load imported', load);
  updateBadge();

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Load Imported',
    message: `${load.origin} → ${load.destination}`,
    priority: 1
  });
}

// Handle multiple loads import
function handleLoadsImported(loads, count) {
  console.log('Haul Monitor: Loads imported', count);
  updateBadge();

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Loads Imported',
    message: `${count} load${count > 1 ? 's' : ''} added to Haul Monitor`,
    priority: 1
  });
}

// Update extension badge with count
function updateBadge() {
  chrome.storage.local.get(['importedLoads'], (result) => {
    const count = (result.importedLoads || []).length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#D89F38' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

// Initialize badge on startup
updateBadge();

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Haul Monitor: Extension installed');
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

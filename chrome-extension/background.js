/**
 * Haul Monitor - Background Service Worker
 * Handles communication between content scripts and the Haul Monitor app
 */

// Configuration
const CONFIG = {
  haulMonitorUrl: 'https://backhaul-matcher.vercel.app',
  localUrl: 'http://localhost:5173'
};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Haul Monitor Background: Received message', message);

  if (message.action === 'loadImported') {
    handleLoadImported(message.load);
    sendResponse({ success: true });
  }

  if (message.action === 'loadsImported') {
    handleLoadsImported(message.loads, message.count);
    sendResponse({ success: true });
  }

  if (message.action === 'getImportedLoads') {
    getImportedLoads().then(loads => sendResponse({ loads }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'clearImportedLoads') {
    clearImportedLoads().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'exportToHaulMonitor') {
    exportToHaulMonitor().then(result => sendResponse(result));
    return true;
  }
});

// Handle single load import
function handleLoadImported(load) {
  console.log('Haul Monitor: Load imported', load);

  // Update badge
  updateBadge();

  // Show notification
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

  // Update badge
  updateBadge();

  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Loads Imported',
    message: `${count} load${count > 1 ? 's' : ''} added to Haul Monitor`,
    priority: 1
  });
}

// Update extension badge with count
async function updateBadge() {
  const { importedLoads = [] } = await chrome.storage.local.get(['importedLoads']);
  const count = importedLoads.length;

  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#D89F38' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Get all imported loads
async function getImportedLoads() {
  const { importedLoads = [] } = await chrome.storage.local.get(['importedLoads']);
  return importedLoads;
}

// Clear all imported loads
async function clearImportedLoads() {
  await chrome.storage.local.set({ importedLoads: [] });
  updateBadge();
}

// Export loads to Haul Monitor app
async function exportToHaulMonitor() {
  try {
    const loads = await getImportedLoads();

    if (loads.length === 0) {
      return { success: false, error: 'No loads to export' };
    }

    // Open Haul Monitor with loads data
    // The app will read from a special URL parameter or localStorage
    const loadsJson = encodeURIComponent(JSON.stringify(loads));
    const url = `${CONFIG.haulMonitorUrl}/import?loads=${loadsJson}`;

    chrome.tabs.create({ url });

    return { success: true, count: loads.length };
  } catch (error) {
    console.error('Haul Monitor: Export error', error);
    return { success: false, error: error.message };
  }
}

// Initialize badge on startup
updateBadge();

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Haul Monitor: Extension installed');

    // Open welcome page or instructions
    chrome.tabs.create({
      url: 'welcome.html'
    });
  }
});

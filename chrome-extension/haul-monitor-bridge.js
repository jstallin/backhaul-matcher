/**
 * Haul Monitor Bridge - Content Script
 * Bridges Chrome extension storage with the Haul Monitor web app
 *
 * This script runs on the Haul Monitor domain and enables
 * the web app to receive imported loads from the extension.
 */

(function() {
  'use strict';

  console.log('Haul Monitor Bridge: Content script loaded');

  // Set a flag on the document for immediate detection
  document.documentElement.setAttribute('data-haul-monitor-extension', 'true');

  // Mark extension as installed for the web app to detect
  window.postMessage({
    type: 'HAUL_MONITOR_EXTENSION_READY',
    version: '1.0.0'
  }, '*');

  // Listen for requests from the web app
  window.addEventListener('message', async (event) => {
    // Only accept messages from the same origin
    if (event.source !== window) return;

    const { type, requestId } = event.data || {};

    switch (type) {
      case 'HAUL_MONITOR_GET_LOADS':
        handleGetLoads(requestId);
        break;

      case 'HAUL_MONITOR_CLEAR_LOADS':
        handleClearLoads(requestId);
        break;

      case 'HAUL_MONITOR_CHECK_EXTENSION':
        window.postMessage({
          type: 'HAUL_MONITOR_EXTENSION_STATUS',
          requestId,
          installed: true,
          version: '1.0.0'
        }, '*');
        break;
    }
  });

  // Get all imported loads from Chrome storage
  function handleGetLoads(requestId) {
    chrome.storage.local.get(['importedLoads'], (result) => {
      const loads = result.importedLoads || [];
      console.log('Haul Monitor Bridge: Sending', loads.length, 'loads to web app');

      window.postMessage({
        type: 'HAUL_MONITOR_LOADS_RESPONSE',
        requestId,
        loads: loads
      }, '*');
    });
  }

  // Clear loads from Chrome storage (after successful sync)
  function handleClearLoads(requestId) {
    chrome.storage.local.set({ importedLoads: [] }, () => {
      console.log('Haul Monitor Bridge: Cleared loads from storage');

      // Also update the badge
      chrome.runtime.sendMessage({ action: 'clearImportedLoads' });

      window.postMessage({
        type: 'HAUL_MONITOR_CLEAR_RESPONSE',
        requestId,
        success: true
      }, '*');
    });
  }

  // Auto-sync on page load if there are pending loads
  setTimeout(() => {
    chrome.storage.local.get(['importedLoads'], (result) => {
      const loads = result.importedLoads || [];
      if (loads.length > 0) {
        console.log('Haul Monitor Bridge: Found', loads.length, 'pending loads');
        window.postMessage({
          type: 'HAUL_MONITOR_PENDING_LOADS',
          count: loads.length,
          loads: loads
        }, '*');
      }
    });
  }, 1000);

})();

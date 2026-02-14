/**
 * Haul Monitor - Load Board Connector
 * Content Script for DAT and other load boards
 *
 * This script detects load data on the page and adds UI for sending loads to Haul Monitor
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    haulMonitorUrl: 'https://backhaul-matcher.vercel.app', // Production URL
    localUrl: 'http://localhost:5173', // Dev URL
    checkInterval: 2000, // Check for new loads every 2 seconds
    buttonClass: 'haul-monitor-btn',
    selectedClass: 'haul-monitor-selected'
  };

  // Detect which load board we're on
  function detectLoadBoard() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    if (hostname.includes('dat.com')) {
      return 'dat';
    }
    if (hostname.includes('123loadboard.com')) {
      return '123loadboard';
    }
    // Mock page detection
    if (pathname.includes('mock-dat') || document.querySelector('.mock-banner')) {
      return 'mock-dat';
    }
    return null;
  }

  // Parse load data from a table row (DAT format)
  function parseLoadFromRow(row, loadBoard) {
    try {
      // Check if row has embedded JSON data (mock page)
      const jsonData = row.getAttribute('data-load-json');
      if (jsonData) {
        return JSON.parse(jsonData);
      }

      // Parse from DOM elements (real DAT page)
      const cells = row.querySelectorAll('td');
      if (cells.length < 15) return null;

      // DAT column order based on screenshot:
      // 0: checkbox, 1: age, 2: pickup, 3: truck, 4: F/P, 5: DH-O, 6: origin,
      // 7: trip, 8: destination, 9: DH-D, 10: company, 11: contact,
      // 12: length, 13: weight, 14: CS, 15: DTP, 16: factor, 17: rate, 18: book

      const getText = (cell) => cell?.textContent?.trim() || '';
      const getNumber = (cell) => {
        const text = getText(cell).replace(/[^0-9.]/g, '');
        return parseFloat(text) || 0;
      };

      // Parse origin city, state
      const originText = getText(cells[6]);
      const originParts = originText.split(',').map(s => s.trim());
      const originCity = originParts[0] || '';
      const originState = originParts[1] || '';

      // Parse destination city, state
      const destText = getText(cells[8]);
      const destParts = destText.split(',').map(s => s.trim());
      const destCity = destParts[0] || '';
      const destState = destParts[1] || '';

      // Parse rate (remove $ and commas)
      const rateText = getText(cells[17]);
      const rate = rateText.includes('$') ? parseFloat(rateText.replace(/[$,]/g, '')) : null;

      // Parse weight
      const weightText = getText(cells[13]);
      const weight = parseFloat(weightText.replace(/[^0-9]/g, '')) || 0;

      // Generate unique ID
      const loadId = `DAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        id: loadId,
        source: loadBoard,
        age: getText(cells[1]),
        pickup: getText(cells[2]),
        truck: getText(cells[3]),
        fp: getText(cells[4]),
        dhO: getText(cells[5]),
        origin: originText,
        originCity: originCity,
        originState: originState,
        originLat: null, // Would need geocoding
        originLng: null,
        trip: getNumber(cells[7]),
        destination: destText,
        destCity: destCity,
        destState: destState,
        destLat: null,
        destLng: null,
        dhD: getText(cells[9]),
        company: getText(cells[10]),
        contact: getText(cells[11]),
        length: getText(cells[12]),
        weight: weight,
        weightFormatted: getText(cells[13]),
        cs: getNumber(cells[14]),
        dtp: getNumber(cells[15]),
        factor: getText(cells[16]).includes('✓'),
        rate: rate,
        rateFormatted: rateText,
        importedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Haul Monitor: Error parsing load row:', error);
      return null;
    }
  }

  // Add "Send to Haul Monitor" button to a row
  function addSendButton(row) {
    // Check if button already exists
    if (row.querySelector('.' + CONFIG.buttonClass)) return;

    const button = document.createElement('button');
    button.className = CONFIG.buttonClass;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
      </svg>
      <span>Send to Haul Monitor</span>
    `;
    button.title = 'Import this load to Haul Monitor';

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendLoadToHaulMonitor(row, button);
    });

    // Find the last cell (Book column) or append to row
    const lastCell = row.querySelector('td:last-child');
    if (lastCell) {
      lastCell.appendChild(button);
    } else {
      row.appendChild(button);
    }
  }

  // Add "Send Selected" floating action button
  function addFloatingActionButton() {
    if (document.querySelector('.haul-monitor-fab')) return;

    const fab = document.createElement('div');
    fab.className = 'haul-monitor-fab';
    fab.innerHTML = `
      <div class="haul-monitor-fab-content">
        <div class="haul-monitor-fab-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="13.5" cy="18.5" r="2.5"/>
            <path d="M16 8h4l3 5v4h-3"/>
            <circle cx="20" cy="18.5" r="2.5"/>
          </svg>
        </div>
        <div class="haul-monitor-fab-info">
          <div class="haul-monitor-fab-title">Haul Monitor</div>
          <div class="haul-monitor-fab-status">
            <span class="haul-monitor-selected-count">0</span> loads selected
          </div>
        </div>
        <button class="haul-monitor-fab-send" disabled>
          Send Selected
        </button>
      </div>
    `;

    fab.querySelector('.haul-monitor-fab-send').addEventListener('click', sendSelectedLoads);

    document.body.appendChild(fab);
    updateSelectedCount();
  }

  // Update selected loads count
  function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.load-checkbox:checked, input[type="checkbox"]:checked');
    const count = checkboxes.length;

    const countEl = document.querySelector('.haul-monitor-selected-count');
    const sendBtn = document.querySelector('.haul-monitor-fab-send');

    if (countEl) countEl.textContent = count;
    if (sendBtn) sendBtn.disabled = count === 0;
  }

  // Send a single load to Haul Monitor
  async function sendLoadToHaulMonitor(row, button) {
    const loadBoard = detectLoadBoard();
    const load = parseLoadFromRow(row, loadBoard);

    if (!load) {
      showNotification('Could not parse load data', 'error');
      return;
    }

    button.classList.add('loading');
    button.innerHTML = `
      <svg class="spinner" width="14" height="14" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70"/>
      </svg>
      <span>Sending...</span>
    `;

    try {
      // Store load in Chrome storage
      const stored = await chrome.storage.local.get(['importedLoads']);
      const loads = stored.importedLoads || [];
      loads.push(load);
      await chrome.storage.local.set({ importedLoads: loads });

      // Send message to background script
      chrome.runtime.sendMessage({
        action: 'loadImported',
        load: load
      });

      button.classList.remove('loading');
      button.classList.add('success');
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        <span>Sent!</span>
      `;

      row.classList.add(CONFIG.selectedClass);
      showNotification(`Load sent to Haul Monitor: ${load.origin} → ${load.destination}`, 'success');

      // Reset button after 3 seconds
      setTimeout(() => {
        button.classList.remove('success');
        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          <span>Send to Haul Monitor</span>
        `;
      }, 3000);

    } catch (error) {
      console.error('Haul Monitor: Error sending load:', error);
      button.classList.remove('loading');
      button.classList.add('error');
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
        <span>Error</span>
      `;
      showNotification('Failed to send load. Please try again.', 'error');
    }
  }

  // Send all selected loads
  async function sendSelectedLoads() {
    const checkboxes = document.querySelectorAll('.load-checkbox:checked, input[type="checkbox"]:checked');
    const loadBoard = detectLoadBoard();
    const loads = [];

    checkboxes.forEach(checkbox => {
      const row = checkbox.closest('tr');
      if (row) {
        const load = parseLoadFromRow(row, loadBoard);
        if (load) loads.push(load);
      }
    });

    if (loads.length === 0) {
      showNotification('No loads selected', 'error');
      return;
    }

    const sendBtn = document.querySelector('.haul-monitor-fab-send');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    try {
      // Store loads in Chrome storage
      const stored = await chrome.storage.local.get(['importedLoads']);
      const existingLoads = stored.importedLoads || [];
      const allLoads = [...existingLoads, ...loads];
      await chrome.storage.local.set({ importedLoads: allLoads });

      // Send message to background script
      chrome.runtime.sendMessage({
        action: 'loadsImported',
        loads: loads,
        count: loads.length
      });

      showNotification(`${loads.length} load${loads.length > 1 ? 's' : ''} sent to Haul Monitor!`, 'success');

      // Mark rows as sent
      checkboxes.forEach(checkbox => {
        const row = checkbox.closest('tr');
        if (row) row.classList.add(CONFIG.selectedClass);
        checkbox.checked = false;
      });

      updateSelectedCount();

    } catch (error) {
      console.error('Haul Monitor: Error sending loads:', error);
      showNotification('Failed to send loads. Please try again.', 'error');
    }

    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Selected';
    }
  }

  // Show notification toast
  function showNotification(message, type = 'info') {
    const existing = document.querySelector('.haul-monitor-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `haul-monitor-toast haul-monitor-toast-${type}`;
    toast.innerHTML = `
      <div class="haul-monitor-toast-icon">
        ${type === 'success' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
        ${type === 'error' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' : ''}
        ${type === 'info' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' : ''}
      </div>
      <div class="haul-monitor-toast-message">${message}</div>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after 4 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Scan page for load rows and add buttons
  function scanAndEnhancePage() {
    const loadBoard = detectLoadBoard();
    if (!loadBoard) return;

    console.log('Haul Monitor: Detected load board:', loadBoard);

    // Find load table rows
    const rows = document.querySelectorAll('table tr[data-load-id], table tbody tr:not(:first-child), .results-table tbody tr');

    rows.forEach(row => {
      // Skip header rows
      if (row.querySelector('th')) return;
      // Skip rows without data
      if (row.querySelectorAll('td').length < 5) return;

      addSendButton(row);
    });

    // Add floating action button
    addFloatingActionButton();

    // Listen for checkbox changes
    document.querySelectorAll('.load-checkbox, input[type="checkbox"]').forEach(checkbox => {
      checkbox.removeEventListener('change', updateSelectedCount);
      checkbox.addEventListener('change', updateSelectedCount);
    });
  }

  // Initialize
  function init() {
    console.log('Haul Monitor: Content script loaded');

    // Initial scan
    scanAndEnhancePage();

    // Re-scan periodically for dynamically loaded content
    setInterval(scanAndEnhancePage, CONFIG.checkInterval);

    // Also re-scan on DOM changes
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
        }
      });
      if (shouldScan) {
        setTimeout(scanAndEnhancePage, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

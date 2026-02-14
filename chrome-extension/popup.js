/**
 * Haul Monitor - Popup Script
 * Handles the extension popup UI
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndDisplayData();
  setupEventListeners();
});

// Load imported loads and display them
async function loadAndDisplayData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getImportedLoads' });
    const loads = response?.loads || [];

    updateStats(loads);
    renderLoadsList(loads);
    updateExportButton(loads);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Update stats display
function updateStats(loads) {
  const loadCount = document.getElementById('loadCount');
  const todayCount = document.getElementById('todayCount');

  loadCount.textContent = loads.length;

  // Count today's imports
  const today = new Date().toDateString();
  const todayLoads = loads.filter(load => {
    const importDate = new Date(load.importedAt).toDateString();
    return importDate === today;
  });
  todayCount.textContent = todayLoads.length;
}

// Render the loads list
function renderLoadsList(loads) {
  const list = document.getElementById('loadsList');

  if (loads.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="3" width="15" height="13" rx="2"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="13.5" cy="18.5" r="2.5"/>
          <path d="M16 8h4l3 5v4h-3"/>
          <circle cx="20" cy="18.5" r="2.5"/>
        </svg>
        <p>No loads imported yet.<br>Visit a load board and click "Send to Haul Monitor" on any load.</p>
      </div>
    `;
    return;
  }

  // Show most recent loads first, max 10
  const recentLoads = [...loads].reverse().slice(0, 10);

  list.innerHTML = recentLoads.map(load => `
    <div class="load-item">
      <div class="load-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="3" width="15" height="13" rx="2"/>
          <path d="M16 8h4l3 5v4h-3"/>
        </svg>
      </div>
      <div class="load-info">
        <div class="load-route">${formatRoute(load)}</div>
        <div class="load-details">${formatDetails(load)}</div>
      </div>
      ${load.rate ? `<div class="load-rate">$${load.rate.toLocaleString()}</div>` : ''}
    </div>
  `).join('');
}

// Format route display
function formatRoute(load) {
  const origin = load.originCity || load.origin?.split(',')[0] || 'Unknown';
  const dest = load.destCity || load.destination?.split(',')[0] || 'Unknown';
  return `${origin} → ${dest}`;
}

// Format details display
function formatDetails(load) {
  const parts = [];

  if (load.trip) {
    parts.push(`${load.trip.toLocaleString()} mi`);
  }

  if (load.truck) {
    parts.push(load.truck);
  }

  if (load.company) {
    parts.push(load.company.substring(0, 20) + (load.company.length > 20 ? '...' : ''));
  }

  return parts.join(' · ') || 'Load details';
}

// Update export button state
function updateExportButton(loads) {
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.disabled = loads.length === 0;
}

// Set up event listeners
function setupEventListeners() {
  // Export button
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const btn = document.getElementById('exportBtn');
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70"/>
      </svg>
      Opening...
    `;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportToHaulMonitor' });

      if (response.success) {
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Opened!
        `;

        // Close popup after short delay
        setTimeout(() => window.close(), 1000);
      } else {
        throw new Error(response.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
        </svg>
        Open in Haul Monitor
      `;
    }
  });

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Clear all imported loads?')) {
      await chrome.runtime.sendMessage({ action: 'clearImportedLoads' });
      await loadAndDisplayData();
    }
  });

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.reload(tab.id);
      window.close();
    }
  });
}

// Add spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

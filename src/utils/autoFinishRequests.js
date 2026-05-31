// Item 008: an in_progress backhaul request (a load was hauled, but the user chose
// to keep searching) auto-completes once its equipment-needed date has passed. The
// already-hauled load and its recorded revenue are kept — finishing only flips the
// status to completed, stamps completed_at, and turns auto-refresh off so no further
// credits are charged.

// Local YYYY-MM-DD (avoids the UTC off-by-one that bit date-only strings elsewhere).
export function localTodayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// True when an in_progress request's equipment-needed date is strictly before today.
export function isExpiredInProgress(request, todayStr = localTodayStr()) {
  if (!request || request.status !== 'in_progress') return false;
  const needed = request.equipment_needed_date;
  if (!needed) return false;
  return String(needed).slice(0, 10) < todayStr;
}

// The DB patch that finalizes a request while preserving its hauled load + revenue.
export function finishPayload() {
  return {
    status: 'completed',
    completed_at: new Date().toISOString(),
    auto_refresh: false,
  };
}

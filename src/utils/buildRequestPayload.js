// Builds the DB payload for creating/updating a backhaul_requests row
// from the SearchView form state.
export function buildRequestPayload(form, userId) {
  const city  = form.datumCity.trim();
  const state = form.datumState.trim().toUpperCase();

  const payload = {
    request_name:             form.requestName.trim(),
    datum_point:              `${city}, ${state}`,
    datum_city:               city,
    datum_state:              state,
    datum_lat:                form.datumLat  || null,
    datum_lng:                form.datumLng  || null,
    fleet_id:                 form.selectedFleetId,
    equipment_available_date: form.equipmentAvailableDate || null,
    equipment_needed_date:    form.equipmentNeededDate    || null,
    is_relay:                 form.isRelay,
    auto_refresh:             form.autoRefresh,
    auto_refresh_interval:    form.autoRefresh ? Math.round(form.autoRefreshInterval * 60) : null,
    // Auto-refresh mandates notifications — persist them on even if the toggle state lagged.
    notification_enabled:     form.notificationEnabled || form.autoRefresh,
    notification_method:      (form.notificationEnabled || form.autoRefresh) ? (form.notificationMethod || 'email') : null,
    status:                   'active',
    user_id:                  userId,
  };

  if (form.autoRefresh) {
    const seconds = Math.round(form.autoRefreshInterval * 60);
    payload.next_refresh_at = new Date(Date.now() + seconds * 60 * 1000).toISOString();
  }

  return payload;
}

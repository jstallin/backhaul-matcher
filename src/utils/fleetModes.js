// Single source of truth for transport "modes" (item 007 / #36), used by both the
// fleet profile and the per-request forms so the option lists can't drift.
// Stored as text[] on fleet_profiles.modes and backhaul_requests.modes.
export const FLEET_MODES = ['Truck Load', 'LTL', 'Intermodal', 'Partial', 'Drayage', 'Parcel', 'Air', 'Water', 'Ocean'];

// #36: at search time, fleet modes and request modes combine into one deduped set
// (union — a request can ADD modes to the fleet's, never narrow below it).
export function unionModes(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

// Pull the modes array off a fleet row. Modes live on fleet_profiles.modes, which
// PostgREST joins as an array (or an object when the FK is unique) — normalize both.
export function modesOfFleet(fleet) {
  if (!fleet) return [];
  const profile = Array.isArray(fleet.fleet_profiles) ? fleet.fleet_profiles[0] : fleet.fleet_profiles;
  return Array.isArray(profile?.modes) ? profile.modes : (Array.isArray(fleet.modes) ? fleet.modes : []);
}

// #30: the modes a search actually covers — the fleet's modes unioned with the
// request's. Empty = no preference (the search is not mode-restricted).
export function searchModes(fleet, request) {
  return unionModes(modesOfFleet(fleet), request?.modes);
}

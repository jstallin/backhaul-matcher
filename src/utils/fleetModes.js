// Single source of truth for transport "modes" (item 007 / #36), used by both the
// fleet profile and the per-request forms so the option lists can't drift.
// Stored as text[] on fleet_profiles.modes and backhaul_requests.modes.
export const FLEET_MODES = ['Truck Load', 'LTL', 'Intermodal', 'Partial', 'Drayage', 'Parcel', 'Air', 'Water', 'Ocean'];

// #36: at search time, fleet modes and request modes combine into one deduped set
// (union — a request can ADD modes to the fleet's, never narrow below it).
export function unionModes(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

// Canonical fleet trailer-type options shown in the UI (v1 FleetSetup + v2 FleetsView).
//
// INVARIANT: every value here MUST have a corresponding Truckstop code in
// EQUIP_TO_TS (api/_lib/truckstop.js). A missing mapping makes a search for that
// type ship an unrecognized <EquipmentType> to Truckstop, which silently returns
// 0 loads (HTTP 200, no error) — see issue #146. This invariant is enforced by
// api/__tests__/equipmentMapping.test.js so a new dropdown option can't ship
// without its code.
export const FLEET_TRAILER_TYPES = [
  'Dry Van',
  'Refrigerated',
  'Flatbed',
  'Step Deck',
  'Removable Gooseneck',
  'Hotshot',
  'Power Only',
];

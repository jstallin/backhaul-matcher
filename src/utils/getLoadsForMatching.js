import { db } from '../lib/supabase';
import demoLoadsData from '../data/backhaul_loads_data.json';

/**
 * Normalize an imported_loads record to the field shape expected by
 * findRouteHomeBackhauls (which was built against the demo JSON schema).
 */
function normalizeImportedLoad(load) {
  return {
    ...load,
    load_id:          load.id,
    pickup_lat:       load.origin_lat,
    pickup_lng:       load.origin_lng,
    pickup_city:      load.origin_city,
    pickup_state:     load.origin_state,
    delivery_lat:     load.destination_lat,
    delivery_lng:     load.destination_lng,
    delivery_city:    load.destination_city,
    delivery_state:   load.destination_state,
    trailer_length:   load.length_ft,
    total_revenue:    load.rate,
    broker:           load.company_name,
  };
}

/**
 * Fetch loads for the matching algorithm.
 *
 * Priority:
 *  1. User's imported loads from Supabase (imported via Chrome extension from DAT, etc.)
 *  2. Demo JSON as fallback when no live loads exist
 *
 * @param {string} userId
 * @param {string|null} fleetId  - optional, filters to loads imported for this fleet
 * @returns {{ loads: Array, isLive: boolean }}
 */
export async function getLoadsForMatching(userId, fleetId = null) {
  if (!userId) {
    return { loads: demoLoadsData, isLive: false };
  }

  try {
    const importedLoads = await db.importedLoads.getAvailable(userId, fleetId);
    if (importedLoads && importedLoads.length > 0) {
      return {
        loads: importedLoads.map(normalizeImportedLoad),
        isLive: true,
      };
    }
  } catch (error) {
    console.warn('Failed to fetch imported loads, falling back to demo data:', error);
  }

  return { loads: demoLoadsData, isLive: false };
}

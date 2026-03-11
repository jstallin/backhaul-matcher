import { db, supabase } from '../lib/supabase';
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
 * Attempt to fetch live loads from Direct Freight for the given request context.
 *
 * @param {string} userId
 * @param {object} requestContext - { datumCity, datumState, homeCity, homeState, equipmentType, pickupDate }
 * @returns {Array|null} Normalized loads, or null if not connected / failed
 */
async function getDirectFreightLoads(userId, requestContext = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const {
      datumCity = '',
      datumState = '',
      homeCity = '',
      homeState = '',
      equipmentType = 'Dry Van',
      pickupDate = ''
    } = requestContext;

    const params = new URLSearchParams({
      origin_city:    datumCity,
      origin_state:   datumState,
      dest_city:      homeCity,
      dest_state:     homeState,
      equipment_type: equipmentType,
      pickup_date:    pickupDate,
      radius_miles:   '150'
    });

    const response = await fetch(`/api/integrations/directfreight/loads?${params}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (response.status === 400) {
      // NOT_CONNECTED — user hasn't set up Direct Freight
      return null;
    }

    if (response.status === 401) {
      // TOKEN_EXPIRED — silently fall through to next source
      console.warn('Direct Freight token expired — falling back to next data source');
      return null;
    }

    if (!response.ok) {
      console.warn('Direct Freight loads request failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.loads?.length > 0 ? data.loads : null;

  } catch (err) {
    console.warn('Direct Freight fetch error, falling back:', err);
    return null;
  }
}

/**
 * Fetch loads for the matching algorithm.
 *
 * Priority:
 *  1. Direct Freight live loads (if connected and requestContext provided)
 *  2. User's imported loads from Supabase (imported via Chrome extension)
 *  3. Demo JSON as fallback
 *
 * @param {string} userId
 * @param {string|null} fleetId       - optional, filters imported loads by fleet
 * @param {object|null} requestContext - optional, enables Direct Freight live fetch
 *   { datumCity, datumState, homeCity, homeState, equipmentType, pickupDate }
 * @returns {{ loads: Array, isLive: boolean, source: string }}
 */
export async function getLoadsForMatching(userId, fleetId = null, requestContext = null) {
  if (!userId) {
    return { loads: demoLoadsData, isLive: false, source: 'demo' };
  }

  // 1. Try Direct Freight if request context is available
  if (requestContext) {
    const dfLoads = await getDirectFreightLoads(userId, requestContext);
    if (dfLoads && dfLoads.length > 0) {
      console.log(`Using ${dfLoads.length} live Direct Freight loads`);
      return { loads: dfLoads, isLive: true, source: 'directfreight' };
    }
  }

  // 2. Try imported loads (DAT / Chrome extension)
  try {
    const importedLoads = await db.importedLoads.getAvailable(userId, fleetId);
    if (importedLoads && importedLoads.length > 0) {
      return {
        loads: importedLoads.map(normalizeImportedLoad),
        isLive: true,
        source: 'imported'
      };
    }
  } catch (error) {
    console.warn('Failed to fetch imported loads, falling back to demo data:', error);
  }

  // 3. Demo data
  return { loads: demoLoadsData, isLive: false, source: 'demo' };
}

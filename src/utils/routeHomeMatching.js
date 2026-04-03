/**
 * Route Home Backhaul Matching Algorithm
 *
 * This algorithm finds backhaul loads that help get you home from a datum point.
 * It looks for loads along the corridor between the datum point and fleet home.
 *
 * Uses PC Miler for truck driving distances + Turf.js for geographic corridor filtering,
 * with fallback to Haversine-based filtering when API is unavailable.
 */

import { getRouteWithCorridor, isPointInCorridor } from './routeCorridorService';
import { getDrivingDistance } from './pcMilerClient';
import { db } from '../lib/supabase';

// Session-level cache for per-load driving distances.
// Survives tab switches and request re-opens within the same browser session.
// Key: "datumLat,datumLng->homeLat,homeLng:relay=bool"
// Value: Map<load_id, { dtp: number|null, dth: number|null }>
const distanceCache = new Map();

// Exposed for test isolation only — do not call in production code
export const clearDistanceCache = () => distanceCache.clear();

const getDistanceCacheKey = (datumPoint, fleetHome, isRelay) => {
  const r = (n) => Math.round(n * 100) / 100; // 2 decimal precision (~1km)
  return `${r(datumPoint.lat)},${r(datumPoint.lng)}->${r(fleetHome.lat)},${r(fleetHome.lng)}:relay=${isRelay}`;
};

// DB cache key for a single origin→dest leg (shared across all users)
const r2 = (n) => Math.round(n * 100) / 100;
const getStopKey = (stop) => stop.lat != null
  ? `${r2(stop.lat)},${r2(stop.lng)}`
  : `${stop.city},${stop.state}`;
const getLegKey = (origin, dest) => `${getStopKey(origin)}->${getStopKey(dest)}`;

// Approximate geographic centroids for US states.
// Used as a fallback when a load has no pickup/delivery coordinates,
// so the corridor filter can still reject loads from the wrong region.
const STATE_CENTROIDS = {
  AL: { lat: 32.7,  lng: -86.7  }, AK: { lat: 64.2,  lng: -153.4 },
  AZ: { lat: 34.3,  lng: -111.1 }, AR: { lat: 34.9,  lng: -92.4  },
  CA: { lat: 36.8,  lng: -119.7 }, CO: { lat: 39.0,  lng: -105.5 },
  CT: { lat: 41.6,  lng: -72.7  }, DE: { lat: 39.0,  lng: -75.5  },
  FL: { lat: 27.8,  lng: -81.7  }, GA: { lat: 32.7,  lng: -83.4  },
  HI: { lat: 20.3,  lng: -156.4 }, ID: { lat: 44.4,  lng: -114.6 },
  IL: { lat: 40.0,  lng: -89.2  }, IN: { lat: 40.3,  lng: -86.1  },
  IA: { lat: 42.0,  lng: -93.2  }, KS: { lat: 38.5,  lng: -98.4  },
  KY: { lat: 37.7,  lng: -84.9  }, LA: { lat: 31.0,  lng: -91.8  },
  ME: { lat: 45.4,  lng: -69.0  }, MD: { lat: 39.1,  lng: -76.8  },
  MA: { lat: 42.2,  lng: -71.5  }, MI: { lat: 44.0,  lng: -85.5  },
  MN: { lat: 46.4,  lng: -93.1  }, MS: { lat: 32.7,  lng: -89.7  },
  MO: { lat: 38.5,  lng: -92.3  }, MT: { lat: 47.0,  lng: -110.5 },
  NE: { lat: 41.5,  lng: -99.9  }, NV: { lat: 38.5,  lng: -117.0 },
  NH: { lat: 44.0,  lng: -71.6  }, NJ: { lat: 40.1,  lng: -74.5  },
  NM: { lat: 34.5,  lng: -106.0 }, NY: { lat: 42.9,  lng: -75.5  },
  NC: { lat: 35.6,  lng: -79.4  }, ND: { lat: 47.5,  lng: -100.4 },
  OH: { lat: 40.4,  lng: -82.8  }, OK: { lat: 35.6,  lng: -96.9  },
  OR: { lat: 44.1,  lng: -120.5 }, PA: { lat: 40.6,  lng: -77.2  },
  RI: { lat: 41.7,  lng: -71.5  }, SC: { lat: 33.9,  lng: -80.9  },
  SD: { lat: 44.4,  lng: -100.2 }, TN: { lat: 35.8,  lng: -86.7  },
  TX: { lat: 31.5,  lng: -99.3  }, UT: { lat: 39.3,  lng: -111.1 },
  VT: { lat: 44.1,  lng: -72.7  }, VA: { lat: 37.8,  lng: -78.2  },
  WA: { lat: 47.4,  lng: -120.4 }, WV: { lat: 38.6,  lng: -80.6  },
  WI: { lat: 44.3,  lng: -89.6  }, WY: { lat: 42.8,  lng: -107.6 },
};

// Road distance correction factor for Haversine estimates.
// Driving distances are typically 1.2-1.5x straight-line distance.
// 1.35 is a good approximation for the US Southeast road network.
const HAVERSINE_ROAD_FACTOR = 1.35;

// Haversine formula to calculate straight-line distance between two points
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Estimated driving distance using Haversine with road correction factor
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  return haversineDistance(lat1, lng1, lat2, lng2) * HAVERSINE_ROAD_FACTOR;
};

// Calculate bearing (direction) between two points
const calculateBearing = (lat1, lng1, lat2, lng2) => {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360
};

// Check if a point is "along the way" from start to end (Haversine fallback)
const isAlongRoute = (pickupLat, pickupLng, datumLat, datumLng, homeLat, homeLng, corridorWidthMiles = 100) => {
  // Calculate direct distance from datum to home
  const directDistance = calculateDistance(datumLat, datumLng, homeLat, homeLng);

  // Calculate distance from datum to pickup, then pickup to home
  const datumToPickup = calculateDistance(datumLat, datumLng, pickupLat, pickupLng);
  const pickupToHome = calculateDistance(pickupLat, pickupLng, homeLat, homeLng);

  // If going to pickup and then home is not significantly longer than direct route,
  // it's along the way (allowing for some deviation)
  const totalDistance = datumToPickup + pickupToHome;
  const deviation = totalDistance - directDistance;

  // Allow up to corridorWidthMiles of deviation
  return deviation <= corridorWidthMiles;
};

/**
 * Calculate net revenue fields from rate config
 * FSC/mile = (DOE PADD Rate - PEG) / MPG
 * Customer Share = Gross Revenue × Customer %
 * Customer Net Credit = Customer Share - (OOR Miles × Mileage Rate) - (Stops × Stop Rate) - (OOR Miles × FSC/mile)
 * Carrier Revenue = Gross Revenue × Carrier %
 */
export const calculateNetRevenue = (totalRevenue, additionalMiles, rateConfig) => {
  const safeRevenue = Number(totalRevenue) || 0;
  const safeAdditionalMiles = Number(additionalMiles) || 0;
  const carrierPct = (rateConfig.revenueSplitCarrier || 20) / 100;
  const customerPct = 1 - carrierPct;
  const mileageRate = Number(rateConfig.mileageRate) || 0;
  const stopRate = Number(rateConfig.stopRate) || 0;
  const stopCount = 2; // Default: pickup + delivery
  const fuelPeg = Number(rateConfig.fuelPeg) || 0;
  const fuelMpg = Number(rateConfig.fuelMpg) || 6;
  const doePaddRate = Number(rateConfig.doePaddRate) || 0;

  // Other charges
  const otherCharge1 = Number(rateConfig.otherCharge1Amount) || 0;
  const otherCharge2 = Number(rateConfig.otherCharge2Amount) || 0;
  const totalOtherCharges = otherCharge1 + otherCharge2;

  // Fuel surcharge per mile
  const fscPerMile = (doePaddRate > 0 && fuelPeg > 0 && fuelMpg > 0)
    ? (doePaddRate - fuelPeg) / fuelMpg
    : 0;

  const customerShare = safeRevenue * customerPct;
  const carrierRevenue = safeRevenue * carrierPct;
  const oorMiles = Math.max(0, safeAdditionalMiles);
  const mileageExpense = oorMiles * mileageRate;
  const stopExpense = stopCount * stopRate;
  const fuelSurcharge = oorMiles * fscPerMile;
  const customerNetCredit = customerShare - mileageExpense - stopExpense - fuelSurcharge - totalOtherCharges;

  return {
    fsc_per_mile: fscPerMile,
    customer_share: customerShare,
    carrier_revenue: carrierRevenue,
    mileage_expense: mileageExpense,
    stop_expense: stopExpense,
    stop_count: stopCount,
    fuel_surcharge: fuelSurcharge,
    other_charges: totalOtherCharges,
    customer_net_credit: customerNetCredit,
    has_rate_config: true
  };
};

/**
 * Find backhaul opportunities along the route home
 *
 * @param {Object} datumPoint - {lat, lng} - Where the driver currently is (or will be)
 * @param {Object} fleetHome - {lat, lng} - Fleet's home base
 * @param {Object} fleetProfile - {trailerType, trailerLength, weightLimit} - Equipment specs
 * @param {Array} backhaulLoads - Available backhaul loads from data
 * @param {Number} homeRadiusMiles - How close to home the delivery should be (default 50)
 * @param {Number} corridorWidthMiles - How far off the direct route is acceptable (default 50)
 * @param {Object} rateConfig - Optional rate configuration from fleet profile
 * @returns {Object} - { opportunities: Array, routeData: { route, corridor } | null }
 */
export const findRouteHomeBackhauls = async (
  datumPoint,
  fleetHome,
  fleetProfile,
  backhaulLoads,
  homeRadiusMiles = 50,
  corridorWidthMiles = 50,
  rateConfig = null,
  isRelay = false
) => {
  const opportunities = [];
  let routeData = null;
  let useCorridor = false;

  // Try to get route corridor from PC Miler
  try {
    console.log('Attempting to fetch route corridor...');
    routeData = await getRouteWithCorridor(datumPoint, fleetHome, corridorWidthMiles);

    if (routeData && routeData.corridor) {
      useCorridor = true;
      console.log('Using geographic corridor for filtering');
    } else {
      console.warn('Corridor unavailable, falling back to Haversine algorithm');
    }
  } catch (error) {
    console.error('Error fetching route corridor:', error);
    console.warn('Falling back to Haversine algorithm');
  }

  // Use PC Miler driving distance if available, fall back to Haversine
  const pcMilerDirect = routeData?.distanceMiles;
  const haversineDirect = calculateDistance(datumPoint.lat, datumPoint.lng, fleetHome.lat, fleetHome.lng);
  const directReturnMiles = (typeof pcMilerDirect === 'number' && !isNaN(pcMilerDirect) && pcMilerDirect > 0)
    ? pcMilerDirect
    : haversineDirect;

  console.log('Direct return miles:', directReturnMiles, pcMilerDirect ? '(PC Miler)' : '(Haversine)');

  // ---- FAST FILTER: equipment + corridor + Haversine pre-check (no API calls) ----
  const availableLoads = backhaulLoads.filter(load => !load.status || load.status === 'available');
  const corridorCandidates = [];

  // Trailer type from fleet profile — used for soft-ranking (not hard filtering)
  const fleetTrailerType = fleetProfile.trailerType || fleetProfile.trailer_type;

  for (const load of availableLoads) {
    // 1. Physical constraints — hard filters (can't haul a load that doesn't fit)
    const reqLength = fleetProfile.trailerLength  || fleetProfile.trailer_length;
    const reqWeight = fleetProfile.weightLimit    || fleetProfile.weight_limit;
    if (reqLength && load.trailer_length  && load.trailer_length  >  reqLength)  continue;
    if (reqWeight && load.weight_lbs      && load.weight_lbs      >  reqWeight)  continue;
    // Note: trailer type is soft-ranked in the sort step, not hard-filtered here

    // 2. Corridor check on pickup — must be along the datum→home route.
    // When exact coordinates are missing, fall back to the state centroid so loads
    // from the wrong region (e.g. Illinois on a GA→FL route) are still rejected.
    const pickupLat = load.pickup_lat ?? STATE_CENTROIDS[load.pickup_state]?.lat ?? null;
    const pickupLng = load.pickup_lng ?? STATE_CENTROIDS[load.pickup_state]?.lng ?? null;
    if (pickupLat !== null && pickupLng !== null) {
      const inCorridor = useCorridor
        ? isPointInCorridor(pickupLat, pickupLng, routeData.corridor)
        : isAlongRoute(pickupLat, pickupLng, datumPoint.lat, datumPoint.lng, fleetHome.lat, fleetHome.lng, corridorWidthMiles);
      if (!inCorridor) continue;
    }

    // 3. Corridor check on delivery — ensures load moves driver along the route, not off-corridor.
    // Same state-centroid fallback when exact coordinates are missing.
    const deliveryLat = load.delivery_lat ?? STATE_CENTROIDS[load.delivery_state]?.lat ?? null;
    const deliveryLng = load.delivery_lng ?? STATE_CENTROIDS[load.delivery_state]?.lng ?? null;
    if (deliveryLat !== null && deliveryLng !== null) {
      const inCorridor = useCorridor
        ? isPointInCorridor(deliveryLat, deliveryLng, routeData.corridor)
        : isAlongRoute(deliveryLat, deliveryLng, datumPoint.lat, datumPoint.lng, fleetHome.lat, fleetHome.lng, corridorWidthMiles);
      if (!inCorridor) continue;
    }

    corridorCandidates.push(load);
  }

  console.log(`Corridor filter: ${corridorCandidates.length} candidates from ${availableLoads.length} available loads`);

  // Cap candidates to avoid excessive API calls.
  // Pre-sort by a combined score: prefer loads whose delivery is closer to home
  // (favorable direction) and with higher revenue. Loads that deliver far past home
  // (northbound/eastbound on a southbound route) rank lower so they don't crowd out
  // geographically good loads with no posted rate.
  const maxCandidates = 25;
  let candidatesToProcess = corridorCandidates;
  if (corridorCandidates.length > maxCandidates) {
    // Estimate additional miles per load using Haversine (coords or state centroid fallback).
    // Loads with fewer estimated additional miles are more likely to pass the scoring-phase
    // additionalMiles cap, so rank them first. Revenue is a tiebreaker — but $0 loads that
    // are geographically ideal still rank above expensive loads that add 400+ miles of detour.
    const firstLegOriginCap = isRelay ? fleetHome : datumPoint;
    corridorCandidates.sort((a, b) => {
      const estimateAdditional = (load) => {
        const pLat = load.pickup_lat   ?? STATE_CENTROIDS[load.pickup_state]?.lat   ?? datumPoint.lat;
        const pLng = load.pickup_lng   ?? STATE_CENTROIDS[load.pickup_state]?.lng   ?? datumPoint.lng;
        const dLat = load.delivery_lat ?? STATE_CENTROIDS[load.delivery_state]?.lat ?? fleetHome.lat;
        const dLng = load.delivery_lng ?? STATE_CENTROIDS[load.delivery_state]?.lng ?? fleetHome.lng;
        const dtp = calculateDistance(firstLegOriginCap.lat, firstLegOriginCap.lng, pLat, pLng);
        const ptd = load.distance_miles ?? calculateDistance(pLat, pLng, dLat, dLng);
        const dth = calculateDistance(dLat, dLng, fleetHome.lat, fleetHome.lng);
        return Math.max(0, dtp + ptd + dth - directReturnMiles);
      };
      const aExtra = estimateAdditional(a);
      const bExtra = estimateAdditional(b);
      // Primary: fewest estimated additional miles first
      if (Math.abs(aExtra - bExtra) > 10) return aExtra - bExtra;
      // Tiebreaker: higher revenue
      return (b.total_revenue || 0) - (a.total_revenue || 0);
    });
    candidatesToProcess = corridorCandidates.slice(0, maxCandidates);
    console.log(`Capped to ${maxCandidates} candidates for PC Miler distance calls`);
  }

  // ---- PRECISE DISTANCES: session cache → DB cache → PC*MILER ----
  // Three-tier lookup: in-memory session cache (fastest), then shared DB cache
  // (across users and sessions), then PC*MILER API (only on true cache misses).
  const distCacheKey = getDistanceCacheKey(datumPoint, fleetHome, isRelay);
  const loadDistCache = distanceCache.get(distCacheKey) || new Map();

  const uncached = candidatesToProcess.filter(load => !loadDistCache.has(load.load_id));
  const cached   = candidatesToProcess.filter(load =>  loadDistCache.has(load.load_id));

  console.log(`Session cache: ${cached.length} hits, ${uncached.length} misses`);

  const cachedResults = cached.map(load => {
    const { dtp, dtm, dth } = loadDistCache.get(load.load_id);
    return { load, dtp, dtm, dth };
  });

  const firstLegOrigin = isRelay ? fleetHome : datumPoint;

  // Build stop objects and per-leg DB keys for all session-uncached loads
  const uncachedWithStops = uncached.map(load => {
    const pickupStop = load.pickup_lat !== null
      ? { lat: load.pickup_lat, lng: load.pickup_lng }
      : { city: load.pickup_city, state: load.pickup_state };
    const deliveryStop = load.delivery_lat !== null
      ? { lat: load.delivery_lat, lng: load.delivery_lng }
      : { city: load.delivery_city, state: load.delivery_state };
    return {
      load,
      pickupStop,
      deliveryStop,
      dtpKey: getLegKey(firstLegOrigin, pickupStop),
      dtmKey: getLegKey(pickupStop, deliveryStop),
      dthKey: getLegKey(deliveryStop, fleetHome),
    };
  });

  // Batch fetch all needed legs from DB cache (one query, shared across all users)
  let dbCacheMap = new Map();
  try {
    const allLegKeys = [...new Set(uncachedWithStops.flatMap(({ dtpKey, dtmKey, dthKey }) => [dtpKey, dtmKey, dthKey]))];
    if (allLegKeys.length > 0) {
      const dbRows = await db.distanceCache.getBatch(allLegKeys);
      dbCacheMap = new Map(dbRows.map(r => [r.route_key, r.distance_miles]));
      console.log(`DB cache: ${dbCacheMap.size} leg hits of ${allLegKeys.length} legs needed`);
    }
  } catch (err) {
    console.warn('DB distance cache lookup failed, proceeding with PC*MILER:', err.message);
  }

  // Full DB hit → no API call. Partial or full miss → PC*MILER for missing legs only.
  const dbHitResults = [];
  const pcMilerNeeded = [];

  for (const item of uncachedWithStops) {
    const dtp = dbCacheMap.get(item.dtpKey);
    const dtm = dbCacheMap.get(item.dtmKey);
    const dth = dbCacheMap.get(item.dthKey);
    if (dtp !== undefined && dtm !== undefined && dth !== undefined) {
      loadDistCache.set(item.load.load_id, { dtp, dtm, dth });
      dbHitResults.push({ load: item.load, dtp, dtm, dth });
    } else {
      pcMilerNeeded.push({ ...item, cachedDtp: dtp, cachedDtm: dtm, cachedDth: dth });
    }
  }

  console.log(`DB hits: ${dbHitResults.length}, PC*MILER needed: ${pcMilerNeeded.length}`);

  // Call PC*MILER only for legs not already in DB cache
  const batchSize = 4;
  const newCacheEntries = [];
  const freshResults = [];

  for (let i = 0; i < pcMilerNeeded.length; i += batchSize) {
    const batch = pcMilerNeeded.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item) => {
      try {
        const [dtp, dtm, dth] = await Promise.all([
          item.cachedDtp !== undefined ? Promise.resolve(item.cachedDtp) : getDrivingDistance([firstLegOrigin, item.pickupStop]),
          item.cachedDtm !== undefined ? Promise.resolve(item.cachedDtm) : getDrivingDistance([item.pickupStop, item.deliveryStop]),
          item.cachedDth !== undefined ? Promise.resolve(item.cachedDth) : getDrivingDistance([item.deliveryStop, fleetHome]),
        ]);
        if (item.cachedDtp === undefined && dtp !== null) newCacheEntries.push({ route_key: item.dtpKey, distance_miles: dtp });
        if (item.cachedDtm === undefined && dtm !== null) newCacheEntries.push({ route_key: item.dtmKey, distance_miles: dtm });
        if (item.cachedDth === undefined && dth !== null) newCacheEntries.push({ route_key: item.dthKey, distance_miles: dth });
        loadDistCache.set(item.load.load_id, { dtp, dtm, dth });
        return { load: item.load, dtp, dtm, dth };
      } catch (error) {
        console.warn(`PC Miler distance failed for load ${item.load.load_id}:`, error.message);
        return { load: item.load, dtp: null, dtm: null, dth: null };
      }
    });
    const batchResults = await Promise.all(batchPromises);
    freshResults.push(...batchResults);
  }

  // Write new distances to DB — fire-and-forget, don't block results
  if (newCacheEntries.length > 0) {
    db.distanceCache.upsertBatch(newCacheEntries).catch(err =>
      console.warn('DB distance cache write failed:', err.message)
    );
  }

  // Persist updated session cache
  distanceCache.set(distCacheKey, loadDistCache);

  const distanceResults = [...cachedResults, ...dbHitResults, ...freshResults];

  // ---- SCORE with real driving distances ----
  for (const { load, dtp, dtm, dth } of distanceResults) {
    // Fall back to Haversine if PC*MILER failed for any leg.
    // In relay mode, dtp = homeToPickup; in non-relay, dtp = datumToPickup.
    const firstLegOrigin = isRelay ? fleetHome : datumPoint;
    const firstLeg = dtp ?? (load.pickup_lat !== null
      ? calculateDistance(firstLegOrigin.lat, firstLegOrigin.lng, load.pickup_lat, load.pickup_lng)
      : null);
    // Middle leg: prefer PC*MILER result, then load.distance_miles (live DAT/DF data),
    // last resort haversine×1.35 (only if coords available).
    const pickupToDelivery = dtm
      ?? load.distance_miles
      ?? (load.pickup_lat !== null
        ? calculateDistance(load.pickup_lat, load.pickup_lng, load.delivery_lat, load.delivery_lng)
        : null);
    const deliveryToHome = dth ?? (load.delivery_lat !== null
      ? calculateDistance(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng)
      : null);

    // Delivery must make forward progress toward home — it can't drop the driver
    // farther from home than the datum point (i.e. moving backward).
    // Exception: if delivery is within homeRadiusMiles it's always valid.
    if (deliveryToHome > directReturnMiles && deliveryToHome > homeRadiusMiles) {
      console.warn(`Skipping load ${load.load_id} (${load.pickup_city}, ${load.pickup_state} → ${load.delivery_city}, ${load.delivery_state}): delivery too far from home (dth=${deliveryToHome?.toFixed(0)}mi, direct=${directReturnMiles.toFixed(0)}mi)`);
      continue;
    }

    // Guard against NaN — skip load if any distance resolved to NaN (not null, which is unknown).
    // null is valid here — it means no distance data available, handled by fallbacks below.
    if ((firstLeg !== null && isNaN(firstLeg)) ||
        (pickupToDelivery !== null && isNaN(pickupToDelivery)) ||
        (deliveryToHome !== null && isNaN(deliveryToHome))) {
      console.warn(`Skipping load ${load.load_id}: invalid distance (firstLeg=${firstLeg}, ptd=${pickupToDelivery}, dth=${deliveryToHome})`);
      continue;
    }

    // Enforce 5-mile minimum on datum→pickup and pickup→delivery legs.
    // delivery→home is excluded — being close to home is desirable.
    // Only apply when we have a real distance — null means unknown (no coords + no PC*MILER),
    // and null coerces to 0 in JS comparisons, which would incorrectly filter every such load.
    const MIN_LEG_MILES = 5;
    if (firstLeg !== null && firstLeg < MIN_LEG_MILES) {
      console.warn(`Skipping load ${load.load_id}: firstLeg below 5mi minimum (${firstLeg})`);
      continue;
    }
    if (pickupToDelivery !== null && pickupToDelivery < MIN_LEG_MILES) {
      console.warn(`Skipping load ${load.load_id}: pickupToDelivery below 5mi minimum (${pickupToDelivery})`);
      continue;
    }

    // Relay math (per Chip's formula):
    //   Full relay route = datum→home + home→pickup + pickup→delivery + delivery→home
    //   Additional miles = home→pickup + pickup→delivery + delivery→home (relay driver's loop)
    //   Revenue/mile based on relay driver's miles only
    //
    // Non-relay math:
    //   Total = datum→pickup + pickup→delivery + delivery→home
    //   Additional = total - directReturn
    const relayOrBackhaulMiles = firstLeg + pickupToDelivery + deliveryToHome;
    const totalMilesWithBackhaul = isRelay
      ? directReturnMiles + relayOrBackhaulMiles
      : relayOrBackhaulMiles;
    const additionalMiles = isRelay
      ? relayOrBackhaulMiles  // relay driver starts at home; entire loop is out-of-route
      : Math.max(0, relayOrBackhaulMiles - directReturnMiles);

    // Cap out-of-route miles — a point can be at most corridorWidthMiles off the route,
    // so additional miles beyond corridorWidthMiles×2 means the load is clearly off-corridor.
    // Skip loads without coordinates that slipped past the spatial filter.
    if (!isRelay && additionalMiles > corridorWidthMiles * 2) {
      console.warn(`Skipping load ${load.load_id} (${load.pickup_city}, ${load.pickup_state} → ${load.delivery_city}, ${load.delivery_state}): too many additional miles (${additionalMiles.toFixed(0)}mi, cap=${corridorWidthMiles * 2}mi)`);
      continue;
    }

    // Calculate value metrics.
    // Revenue/mile uses the relay driver's miles in relay mode (not the full datum→home leg).
    const totalRevenue = load.total_revenue || 0;
    const revenuePerMile = relayOrBackhaulMiles > 0 ? totalRevenue / relayOrBackhaulMiles : 0;
    const revenuePerAdditionalMile = additionalMiles > 0 ? totalRevenue / additionalMiles : totalRevenue * 100;

    // Efficiency score - rewards high revenue with low deviation from direct route
    const efficiencyScore = revenuePerMile * (directReturnMiles / totalMilesWithBackhaul) * 100;

    // Calculate net revenue if rate config is available
    const netRevenue = rateConfig
      ? calculateNetRevenue(totalRevenue, additionalMiles, rateConfig)
      : { has_rate_config: false };

    // Track whether all three legs came from PC*MILER
    const usedPCMiler = dtp !== null && dtm !== null && dth !== null;

    // Trailer type match: true when both sides have a value and they match,
    // or when either side is missing (no preference → neutral, not penalized)
    const trailerTypeMatch = !fleetTrailerType || !load.equipment_type || load.equipment_type === fleetTrailerType;

    opportunities.push({
      ...load,
      // Route metrics
      datum_to_pickup_miles: Math.round(firstLeg),
      pickup_to_delivery_miles: Math.round(pickupToDelivery),
      delivery_to_home_miles: Math.round(deliveryToHome),
      total_miles: Math.round(totalMilesWithBackhaul),
      direct_return_miles: Math.round(directReturnMiles),
      additional_miles: Math.round(additionalMiles),

      // Legacy property mappings for BackhaulResults component
      finalToPickup: Math.round(firstLeg),
      additionalMiles: Math.round(additionalMiles),
      oorMiles: Math.round(totalMilesWithBackhaul),
      weight: load.weight_lbs,
      trailerLength: load.trailer_length,
      equipmentType: load.equipment_type,
      totalRevenue: totalRevenue,
      revenuePerMile: revenuePerMile,

      // Value metrics
      revenue_per_mile: revenuePerMile,
      revenue_per_additional_mile: revenuePerAdditionalMile,
      efficiency_score: efficiencyScore,

      // Distance source
      distance_source: usedPCMiler ? 'pcmiler' : 'haversine',

      // Net revenue metrics
      ...netRevenue,

      // For display
      formatted_revenue: `$${totalRevenue.toFixed(2)}`,
      formatted_rpm: `$${revenuePerMile.toFixed(2)}`,

      // For BackhaulResults component compatibility
      origin: {
        address: `${load.pickup_city}, ${load.pickup_state}`,
        city: load.pickup_city,
        state: load.pickup_state,
        lat: load.pickup_lat,
        lng: load.pickup_lng
      },
      destination: {
        address: `${load.delivery_city}, ${load.delivery_state}`,
        city: load.delivery_city,
        state: load.delivery_state,
        lat: load.delivery_lat,
        lng: load.delivery_lng
      },

      // Trailer type ranking
      trailer_type_match: trailerTypeMatch,

      // Ranking category
      is_excellent: efficiencyScore > 50 && additionalMiles < 50,
      is_good: efficiencyScore > 30 && additionalMiles < 100,
      is_acceptable: efficiencyScore > 15
    });
  }

  // Sort: trailer type matches always come first (when fleet has a type set).
  // Within each tier, rank by customer net credit (if rate config) or efficiency score.
  if (rateConfig) {
    opportunities.sort((a, b) => {
      if (a.trailer_type_match !== b.trailer_type_match) return a.trailer_type_match ? -1 : 1;
      const creditDiff = (b.customer_net_credit || 0) - (a.customer_net_credit || 0);
      if (creditDiff !== 0) return creditDiff;
      return (b.carrier_revenue || 0) - (a.carrier_revenue || 0);
    });
  } else {
    opportunities.sort((a, b) => {
      if (a.trailer_type_match !== b.trailer_type_match) return a.trailer_type_match ? -1 : 1;
      return b.efficiency_score - a.efficiency_score;
    });
  }

  console.log(`Matching complete: ${opportunities.length} opportunities found`);
  return { opportunities, routeData };
};

/**
 * Get map markers for visualizing route home with backhauls
 */
export const getRouteMapMarkers = (datumPoint, fleetHome, topBackhauls) => {
  const markers = [];

  // Datum point (Point A - where driver is)
  markers.push({
    id: 'datum',
    type: 'datum',
    lat: datumPoint.lat,
    lng: datumPoint.lng,
    label: 'A',
    title: 'Current Location (Datum)',
    color: '#EF4444' // Red
  });

  // Fleet home (Point B - destination)
  markers.push({
    id: 'home',
    type: 'home',
    lat: fleetHome.lat,
    lng: fleetHome.lng,
    label: 'B',
    title: 'Fleet Home',
    color: '#10B981' // Green
  });

  // Top backhaul opportunities (numbered 1-10)
  topBackhauls.slice(0, 10).forEach((load, index) => {
    // Pickup marker
    markers.push({
      id: `pickup-${load.load_id}`,
      type: 'pickup',
      lat: load.pickup_lat,
      lng: load.pickup_lng,
      label: `${index + 1}P`,
      title: `#${index + 1} Pickup: ${load.pickup_city}, ${load.pickup_state}`,
      loadNumber: index + 1,
      color: '#008b00' // Golden amber
    });

    // Delivery marker
    markers.push({
      id: `delivery-${load.load_id}`,
      type: 'delivery',
      lat: load.delivery_lat,
      lng: load.delivery_lng,
      label: `${index + 1}D`,
      title: `#${index + 1} Delivery: ${load.delivery_city}, ${load.delivery_state}`,
      loadNumber: index + 1,
      color: '#5EA0DB' // Blue
    });
  });

  return markers;
};

/**
 * Work Week Planning Algorithm
 *
 * Finds optimal 2-load weekly work plans starting and ending at fleet home base.
 * Works backwards from the end-of-week deadline per the spec's core philosophy:
 *   "find the best load back first, then build the week forward from that anchor."
 *
 * Step 1 — Find return candidates (delivery near home, within string budget)
 * Step 2 — Find outbound candidates (pickup near home)
 * Step 3 — Batch-fetch PC*MILER distances for both groups
 * Step 4 — Pair candidates where outbound delivery is near return pickup
 * Step 5 — Build chains, calculate timing backwards from deadline, rank
 */

import { calculateDistance, calculateNetRevenue } from './routeHomeMatching';
import { getDrivingDistance } from './pcMilerClient';
import { calculateArrival, calculateLatestDeparture } from './hosCalculator';

// Max candidates pre-filtered before PC*MILER calls.
// Raised to 30 because state-centroid pre-screening now eliminates clearly far loads
// before we hit this cap, so the batch is smaller than the old "always 20" approach.
const MAX_RETURN_CANDIDATES   = 30;
const MAX_OUTBOUND_CANDIDATES = 30;
const MAX_OUTBOUND_TOP        = 10; // top outbounds by rate/mile to pair against returns
const MAX_CHAINS_RETURNED     = 10;

export const PLAN_DEFAULTS = {
  stringMiles:           2500,
  minStringMiles:        2000,
  maxStringMiles:        3000,
  homeRadiusMiles:        150, // return delivery must be within this of home (enforced strictly)
  connectionRadiusMiles:  150, // outbound delivery must be within this of return pickup
  minTotalMiles:          500,
  maxReturnLegMiles:     1250, // spec: max single return leg
  maxRadiusFromHomeMiles: 1000, // outbound delivery must be within this of home
};

// ── Internal helpers ──────────────────────────────────────────────────────────

// Build the stop descriptor PC*MILER accepts — coords when available, city/state fallback
const toStop = (load, end) => {
  const lat = end === 'pickup' ? load.pickup_lat   : load.delivery_lat;
  const lng = end === 'pickup' ? load.pickup_lng   : load.delivery_lng;
  const city  = end === 'pickup' ? load.pickup_city  : load.delivery_city;
  const state = end === 'pickup' ? load.pickup_state : load.delivery_state;
  return lat != null ? { lat, lng } : { city, state };
};

const passesEquipment = (load, profile) => {
  const { trailerType, trailerLength, weightLimit } = profile;
  if (trailerType  && load.equipment_type && load.equipment_type !== trailerType)  return false;
  if (trailerLength && load.trailer_length && load.trailer_length > trailerLength) return false;
  if (weightLimit   && load.weight_lbs     && load.weight_lbs     > weightLimit)   return false;
  return true;
};

// Haversine distance between a load endpoint and a reference point — null when coords absent
const haversineTo = (lat, lng, refLat, refLng) =>
  lat != null && lng != null ? calculateDistance(lat, lng, refLat, refLng) : null;

// Approximate US state centroids — used to screen null-coord Truckstop loads
const STATE_CENTROIDS = {
  AL:{lat:32.8,lng:-86.9}, AR:{lat:35.0,lng:-92.5}, AZ:{lat:34.3,lng:-111.1},
  CA:{lat:37.2,lng:-119.5}, CO:{lat:39.0,lng:-105.5}, CT:{lat:41.6,lng:-72.7},
  DE:{lat:39.0,lng:-75.5}, FL:{lat:28.1,lng:-81.6}, GA:{lat:32.7,lng:-83.4},
  IA:{lat:41.9,lng:-93.4}, ID:{lat:44.5,lng:-114.3}, IL:{lat:40.0,lng:-89.2},
  IN:{lat:39.9,lng:-86.3}, KS:{lat:38.5,lng:-96.7}, KY:{lat:37.5,lng:-85.3},
  LA:{lat:31.0,lng:-91.8}, MA:{lat:42.3,lng:-71.8}, MD:{lat:39.0,lng:-76.8},
  ME:{lat:45.3,lng:-69.0}, MI:{lat:44.1,lng:-84.7}, MN:{lat:46.4,lng:-93.1},
  MO:{lat:38.3,lng:-92.5}, MS:{lat:32.7,lng:-89.7}, MT:{lat:47.0,lng:-110.4},
  NC:{lat:35.5,lng:-79.4}, ND:{lat:47.5,lng:-100.3}, NE:{lat:41.5,lng:-99.9},
  NH:{lat:43.7,lng:-71.6}, NJ:{lat:40.1,lng:-74.5}, NM:{lat:34.3,lng:-106.0},
  NV:{lat:39.3,lng:-116.6}, NY:{lat:42.2,lng:-74.9}, OH:{lat:40.4,lng:-82.8},
  OK:{lat:35.6,lng:-96.9}, OR:{lat:44.6,lng:-122.1}, PA:{lat:40.9,lng:-77.8},
  RI:{lat:41.7,lng:-71.5}, SC:{lat:33.9,lng:-80.9}, SD:{lat:44.4,lng:-100.2},
  TN:{lat:35.9,lng:-86.7}, TX:{lat:31.1,lng:-97.6}, UT:{lat:39.3,lng:-111.1},
  VA:{lat:37.7,lng:-78.2}, VT:{lat:44.1,lng:-72.7}, WA:{lat:47.4,lng:-120.5},
  WI:{lat:44.5,lng:-89.6}, WV:{lat:38.5,lng:-80.7}, WY:{lat:43.0,lng:-107.6},
};

// Distance from a load endpoint to a reference point.
// Uses exact coords when available; falls back to state centroid for null-coord loads.
// Returns null only when neither coords nor state are available.
const approxDistanceTo = (lat, lng, state, refLat, refLng) => {
  if (lat != null && lng != null) return calculateDistance(lat, lng, refLat, refLng);
  const c = STATE_CENTROIDS[state];
  return c ? calculateDistance(c.lat, c.lng, refLat, refLng) : null;
};

// ── Pure scoring functions (exported for testing) ─────────────────────────────

/**
 * Score a single return load given its leg distances.
 * Revenue/mile is over the miles the driver actually runs on this leg:
 * pickup → delivery + delivery → home.
 */
export const scoreReturnLoad = (load, pickupToDeliveryMiles, deliveryToHomeMiles) => {
  const totalMiles = pickupToDeliveryMiles + deliveryToHomeMiles;
  const revenue    = Number(load.total_revenue) || 0;
  return {
    load,
    pickupToDeliveryMiles,
    deliveryToHomeMiles,
    totalMiles,
    revenue,
    revenuePerMile: totalMiles > 0 ? revenue / totalMiles : 0,
  };
};

/**
 * Assemble a 2-load chain from pre-computed leg distances.
 * Works backwards from weekDeadline using the HOS calculator to derive
 * the required departure time and all intermediate arrival times.
 *
 * Leg order: home → outbound pickup → (loaded) → outbound delivery
 *            → (deadhead) → return pickup → (loaded) → return delivery → home
 */
export const buildChain = ({
  outboundLoad,
  returnLoad,
  homeToOutboundPickupMiles,
  outboundLoadedMiles,
  deadheadMiles,
  returnLoadedMiles,
  deliveryToHomeMiles,
  weekDeadline,
  hosConfig = {},
  rateConfig = null,
  maxRadiusFromHome = 0,
}) => {
  const totalMiles   = homeToOutboundPickupMiles + outboundLoadedMiles + deadheadMiles
                     + returnLoadedMiles + deliveryToHomeMiles;
  const outboundRev  = Number(outboundLoad.total_revenue) || 0;
  const returnRev    = Number(returnLoad.total_revenue)   || 0;
  const totalRevenue = outboundRev + returnRev;
  const revenuePerTotalMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

  // Work backwards: when must the driver pick up the return load?
  const returnLegMiles   = returnLoadedMiles + deliveryToHomeMiles;
  const returnPickupDeadline = calculateLatestDeparture(weekDeadline, returnLegMiles, hosConfig);

  // How far back must the driver depart from home?
  const preReturnMiles = homeToOutboundPickupMiles + outboundLoadedMiles + deadheadMiles;
  const departureTime  = calculateLatestDeparture(returnPickupDeadline, preReturnMiles, hosConfig);

  // Forward-calculate key timestamps for the itinerary
  const returnPickupTime = calculateArrival(departureTime, preReturnMiles, hosConfig);
  const arrivalHome      = calculateArrival(returnPickupTime, returnLegMiles, hosConfig);

  const netRevenue = rateConfig
    ? calculateNetRevenue(totalRevenue, totalMiles, rateConfig)
    : { has_rate_config: false };

  return {
    totalMiles,
    totalRevenue,
    revenuePerTotalMile,
    maxRadiusFromHome,
    withinOptimalBand: totalMiles >= PLAN_DEFAULTS.minStringMiles
                    && totalMiles <= PLAN_DEFAULTS.maxStringMiles,
    departureTime,
    returnPickupTime,
    arrivalHome,
    legs: {
      homeToPickup:    homeToOutboundPickupMiles,
      outboundLoaded:  outboundLoadedMiles,
      deadhead:        deadheadMiles,
      returnLoaded:    returnLoadedMiles,
      returnToHome:    deliveryToHomeMiles,
    },
    outboundLoad,
    returnLoad,
    ...netRevenue,
  };
};

/**
 * Assemble a 3-load chain: outbound → connector → return.
 * Same backwards-from-deadline timing as buildChain.
 */
export const buildChain3 = ({
  outboundLoad, connectorLoad, returnLoad,
  homeToOutboundPickupMiles, outboundLoadedMiles,
  deadhead1Miles, connectorLoadedMiles, deadhead2Miles,
  returnLoadedMiles, deliveryToHomeMiles,
  weekDeadline, hosConfig = {}, rateConfig = null, maxRadiusFromHome = 0,
}) => {
  const totalMiles = homeToOutboundPickupMiles + outboundLoadedMiles
                   + deadhead1Miles + connectorLoadedMiles + deadhead2Miles
                   + returnLoadedMiles + deliveryToHomeMiles;
  const totalRevenue = (Number(outboundLoad.total_revenue) || 0)
                     + (Number(connectorLoad.total_revenue) || 0)
                     + (Number(returnLoad.total_revenue) || 0);
  const revenuePerTotalMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

  const returnLegMiles  = returnLoadedMiles + deliveryToHomeMiles;
  const returnPickupDeadline = calculateLatestDeparture(weekDeadline, returnLegMiles, hosConfig);

  const preReturnMiles = homeToOutboundPickupMiles + outboundLoadedMiles
                       + deadhead1Miles + connectorLoadedMiles + deadhead2Miles;
  const departureTime  = calculateLatestDeparture(returnPickupDeadline, preReturnMiles, hosConfig);

  const returnPickupTime = calculateArrival(departureTime, preReturnMiles, hosConfig);
  const arrivalHome      = calculateArrival(returnPickupTime, returnLegMiles, hosConfig);

  const netRevenue = rateConfig
    ? calculateNetRevenue(totalRevenue, totalMiles, rateConfig)
    : { has_rate_config: false };

  return {
    is3Load: true,
    totalMiles, totalRevenue, revenuePerTotalMile, maxRadiusFromHome,
    withinOptimalBand: totalMiles >= PLAN_DEFAULTS.minStringMiles
                    && totalMiles <= PLAN_DEFAULTS.maxStringMiles,
    departureTime, returnPickupTime, arrivalHome,
    legs: {
      homeToPickup:    homeToOutboundPickupMiles,
      outboundLoaded:  outboundLoadedMiles,
      deadhead1:       deadhead1Miles,
      connectorLoaded: connectorLoadedMiles,
      deadhead2:       deadhead2Miles,
      returnLoaded:    returnLoadedMiles,
      returnToHome:    deliveryToHomeMiles,
    },
    outboundLoad, connectorLoad, returnLoad,
    ...netRevenue,
  };
};

// ── Main async planner ────────────────────────────────────────────────────────

/**
 * Plan an optimal 2-load work week.
 *
 * @param {object} params
 * @param {{ lat, lng, city, state }} params.fleetHome
 * @param {{ trailerType, trailerLength, weightLimit }} params.fleetProfile
 * @param {Date}   params.weekDeadline       Must be home by this time
 * @param {Array}  params.loads              All available loads (pre-fetched)
 * @param {object} [params.rateConfig]       Optional — enables net revenue calc
 * @param {object} [params.hosConfig]        Optional HOS overrides
 * @param {number} [params.stringMiles]      Weekly mile budget (default 2500)
 * @param {number} [params.homeRadiusMiles]  Return delivery / outbound pickup radius (default 100)
 * @returns {Promise<{ chains, returnOnlyOptions, meta }>}
 */
export const planWorkWeek = async ({
  fleetHome,
  fleetProfile = {},
  weekDeadline,
  loads = [],
  rateConfig = null,
  hosConfig = {},
  stringMiles      = PLAN_DEFAULTS.stringMiles,
  homeRadiusMiles  = PLAN_DEFAULTS.homeRadiusMiles,
}) => {
  const maxTotal   = Math.min(stringMiles * 1.2, PLAN_DEFAULTS.maxStringMiles);
  const available  = loads.filter(l => !l.status || l.status === 'available');
  console.log(`[WWP] ${available.length} available loads, home=${fleetHome.city},${fleetHome.state}, homeRadius=${homeRadiusMiles}mi, maxTotal=${maxTotal}mi`);

  // ── 1. Pre-filter candidates (Haversine, no API calls) ─────────────────────

  // 2.5x buffer when using state centroid (less precise than exact coords).
  // Lets TN/KY/VA pass while clearly-far states (IL, MN, TX) are screened out.
  const CENTROID_BUFFER = 2.5;

  const returnCandidates = available
    .filter(load => {
      if (!passesEquipment(load, fleetProfile)) return false;
      const d = approxDistanceTo(
        load.delivery_lat, load.delivery_lng, load.delivery_state,
        fleetHome.lat, fleetHome.lng
      );
      // null = no coords AND no state — include and let PC*MILER decide
      // exact coord: must be within homeRadiusMiles
      // state centroid: must be within homeRadiusMiles * CENTROID_BUFFER
      if (d == null) return true;
      const threshold = (load.delivery_lat != null) ? homeRadiusMiles : homeRadiusMiles * CENTROID_BUFFER;
      return d <= threshold;
    })
    .slice(0, MAX_RETURN_CANDIDATES);

  const outboundCandidates = available
    .filter(load => {
      if (!passesEquipment(load, fleetProfile)) return false;
      const d = approxDistanceTo(
        load.pickup_lat, load.pickup_lng, load.pickup_state,
        fleetHome.lat, fleetHome.lng
      );
      if (d == null) return true;
      const threshold = (load.pickup_lat != null) ? homeRadiusMiles : homeRadiusMiles * CENTROID_BUFFER;
      return d <= threshold;
    })
    .slice(0, MAX_OUTBOUND_CANDIDATES);

  console.log(`[WWP] Haversine pre-filter: ${returnCandidates.length} return candidates, ${outboundCandidates.length} outbound candidates`);

  // ── 2. Batch-fetch driving distances for both candidate groups ──────────────

  const [returnDistances, outboundDistances] = await Promise.all([
    Promise.all(returnCandidates.map(async load => {
      const dth = await getDrivingDistance([toStop(load, 'delivery'), fleetHome]).catch(() => null);
      const ptd = load.distance_miles
        ?? (load.pickup_lat != null
          ? calculateDistance(load.pickup_lat, load.pickup_lng, load.delivery_lat, load.delivery_lng)
          : null);
      return { load, ptd, dth };
    })),

    Promise.all(outboundCandidates.map(async load => {
      const htp = await getDrivingDistance([fleetHome, toStop(load, 'pickup')]).catch(() => null);
      const ptd = load.distance_miles
        ?? (load.pickup_lat != null
          ? calculateDistance(load.pickup_lat, load.pickup_lng, load.delivery_lat, load.delivery_lng)
          : null);
      return { load, htp, ptd };
    })),
  ]);

  // ── 3. Score and filter return candidates ───────────────────────────────────

  const returnWithDistances = returnDistances.filter(({ ptd, dth }) => ptd != null && dth != null);
  console.log(`[WWP] Returns after PC*MILER: ${returnWithDistances.length} got distances`);
  console.log(`[WWP] Returns dth breakdown:`, returnWithDistances.map(r => `${r.load.delivery_city},${r.load.delivery_state} dth=${Math.round(r.dth)}mi`));

  const scoredReturns = returnWithDistances
    // Strict 150mi cap on delivery-to-home — catches null-coord loads that bypassed Haversine
    .filter(({ dth }) => {
      const pass = dth <= homeRadiusMiles;
      if (!pass) console.log(`[WWP] Return REJECTED dth=${Math.round(dth)}mi > ${homeRadiusMiles}mi`);
      return pass;
    })
    .filter(({ load, ptd, dth }) => {
      const legMiles = ptd + dth;
      const pass = legMiles >= PLAN_DEFAULTS.minTotalMiles && legMiles <= PLAN_DEFAULTS.maxReturnLegMiles;
      if (!pass) console.log(`[WWP] Return REJECTED legMiles=${Math.round(legMiles)}mi (min=${PLAN_DEFAULTS.minTotalMiles} max=${PLAN_DEFAULTS.maxReturnLegMiles}) ${load.pickup_city}→${load.delivery_city}`);
      return pass;
    })
    .map(({ load, ptd, dth }) => scoreReturnLoad(load, ptd, dth))
    .sort((a, b) => b.revenuePerMile - a.revenuePerMile)
    .slice(0, 10);

  // Score outbounds by their own rate/mile so the best outbounds pair with best returns.
  // Also enforce max radius from home — outbound delivery must be within 1000mi.
  const scoredOutbounds = outboundDistances
    .filter(({ htp, ptd }) => htp != null && ptd != null)
    .filter(({ load }) => {
      const d = haversineTo(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng);
      return d == null || d <= PLAN_DEFAULTS.maxRadiusFromHomeMiles;
    })
    .map(({ load, htp, ptd }) => ({
      load, htp, ptd,
      revPerMile: Number(load.total_revenue) / Math.max(1, htp + ptd),
      deliveryToHomeHaversine: haversineTo(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng) ?? 0,
    }))
    .sort((a, b) => b.revPerMile - a.revPerMile)
    .slice(0, MAX_OUTBOUND_TOP);

  console.log(`[WWP] scoredReturns: ${scoredReturns.length}, scoredOutbounds: ${scoredOutbounds.length}`);
  if (scoredReturns.length > 0) console.log(`[WWP] Top return: ${scoredReturns[0].load.pickup_city} → ${scoredReturns[0].load.delivery_city} dth=${Math.round(scoredReturns[0].deliveryToHomeMiles)}mi $${scoredReturns[0].revenue}`);
  if (scoredOutbounds.length > 0) console.log(`[WWP] Top outbound: ${scoredOutbounds[0].load.pickup_city} → ${scoredOutbounds[0].load.delivery_city} htp=${Math.round(scoredOutbounds[0].htp)}mi $${scoredOutbounds[0].load.total_revenue}`);

  // Detailed outbound filter rejection logging (only if none pass)
  if (scoredOutbounds.length === 0) {
    const outWithDist = outboundDistances.filter(({ htp, ptd }) => htp != null && ptd != null);
    console.log(`[WWP] Outbound filter details: ${outWithDist.length} had PC*MILER distances`);
    outWithDist.forEach(({ load, htp, ptd }) => {
      const d = haversineTo(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng);
      console.log(`[WWP]   out ${load.pickup_city}→${load.delivery_city} htp=${Math.round(htp)}mi ptd=${Math.round(ptd)}mi deliveryDistFromHome=${d != null ? Math.round(d) : 'no-coords'}mi`);
    });
  }

  // ── 4. Pair candidates + batch-fetch deadhead distances ────────────────────

  // Iterate returns (by return rate/mile) × outbounds (by outbound rate/mile)
  // so highest-value combinations are evaluated first
  const pairCandidates = [];
  for (const ret of scoredReturns) {
    for (const out of scoredOutbounds) {
      if (out.load.load_id === ret.load.load_id) continue;

      // Quick total-miles sanity check before deadhead call
      const roughTotal = out.htp + out.ptd + ret.pickupToDeliveryMiles + ret.deliveryToHomeMiles;
      if (roughTotal > maxTotal) continue;

      // Haversine connection: outbound delivery → return pickup
      const connDist = haversineTo(
        out.load.delivery_lat, out.load.delivery_lng,
        ret.load.pickup_lat,   ret.load.pickup_lng
      );
      if (connDist != null && connDist > PLAN_DEFAULTS.connectionRadiusMiles) continue;

      pairCandidates.push({ ret, out });
    }
  }

  console.log(`[WWP] Pair candidates after Haversine: ${pairCandidates.length}`);

  // Fetch deadhead distances for all viable pairs in parallel
  const pairsWithDeadhead = await Promise.all(
    pairCandidates.map(async ({ ret, out }) => {
      const deadhead = await getDrivingDistance([
        toStop(out.load, 'delivery'),
        toStop(ret.load, 'pickup'),
      ]).catch(() => null);
      return { ret, out, deadhead };
    })
  );

  const pairsGotDeadhead = pairsWithDeadhead.filter(({ deadhead }) => deadhead != null);
  console.log(`[WWP] Pairs after deadhead fetch: ${pairsGotDeadhead.length} of ${pairCandidates.length} got distances`);

  // ── 5. Build, filter, and rank chains ──────────────────────────────────────

  const chains = pairsWithDeadhead
    .filter(({ deadhead }) => deadhead != null)
    .map(({ ret, out, deadhead }) => {
      const totalMiles = out.htp + out.ptd + deadhead
                       + ret.pickupToDeliveryMiles + ret.deliveryToHomeMiles;
      if (totalMiles < PLAN_DEFAULTS.minTotalMiles || totalMiles > maxTotal) return null;

      return buildChain({
        outboundLoad:              out.load,
        returnLoad:                ret.load,
        homeToOutboundPickupMiles: Math.round(out.htp),
        outboundLoadedMiles:       Math.round(out.ptd),
        deadheadMiles:             Math.round(deadhead),
        returnLoadedMiles:         Math.round(ret.pickupToDeliveryMiles),
        deliveryToHomeMiles:       Math.round(ret.deliveryToHomeMiles),
        weekDeadline,
        hosConfig,
        rateConfig,
        maxRadiusFromHome:         Math.round(out.deliveryToHomeHaversine || 0),
      });
    })
    .filter(Boolean)
    .sort((a, b) => b.revenuePerTotalMile - a.revenuePerTotalMile)
    .slice(0, MAX_CHAINS_RETURNED);

  // ── 6. 3-load chains (outbound → connector → return) ──────────────────────
  // For each top return × top outbound pair, find a connector load that bridges
  // outbound delivery → connector pickup → connector delivery → return pickup.
  // Caps: top 3 each side × top 3 connectors = max 27 triplets × 2 PC*MILER calls.

  const MAX_3LOAD_SIDE       = 3;
  const MAX_CONNECTORS_PAIR  = 3;

  const top3Returns   = scoredReturns.slice(0, MAX_3LOAD_SIDE);
  const top3Outbounds = scoredOutbounds.slice(0, MAX_3LOAD_SIDE);

  const tripletCandidates = [];
  for (const ret of top3Returns) {
    for (const out of top3Outbounds) {
      if (out.load.load_id === ret.load.load_id) continue;
      // Need at least 100mi of budget left for connector + its deadheads
      const baseMiles = out.htp + out.ptd + ret.pickupToDeliveryMiles + ret.deliveryToHomeMiles;
      if (maxTotal - baseMiles < 100) continue;

      const connectors = available
        .filter(l => {
          if (l.load_id === out.load.load_id || l.load_id === ret.load.load_id) return false;
          if (!passesEquipment(l, fleetProfile)) return false;
          const d1 = haversineTo(l.pickup_lat,   l.pickup_lng,   out.load.delivery_lat, out.load.delivery_lng);
          const d2 = haversineTo(l.delivery_lat, l.delivery_lng, ret.load.pickup_lat,   ret.load.pickup_lng);
          return (d1 == null || d1 <= PLAN_DEFAULTS.connectionRadiusMiles)
              && (d2 == null || d2 <= PLAN_DEFAULTS.connectionRadiusMiles);
        })
        .slice(0, MAX_CONNECTORS_PAIR);

      for (const conn of connectors) {
        tripletCandidates.push({ ret, out, conn });
      }
    }
  }

  // Fetch both deadheads for each triplet in parallel
  const tripletResults = await Promise.all(
    tripletCandidates.map(async ({ ret, out, conn }) => {
      const [dh1, dh2] = await Promise.all([
        getDrivingDistance([toStop(out.load, 'delivery'), toStop(conn, 'pickup')]).catch(() => null),
        getDrivingDistance([toStop(conn, 'delivery'),     toStop(ret.load, 'pickup')]).catch(() => null),
      ]);
      const connPtd = conn.distance_miles
        ?? (conn.pickup_lat != null
          ? calculateDistance(conn.pickup_lat, conn.pickup_lng, conn.delivery_lat, conn.delivery_lng)
          : null);
      return { ret, out, conn, dh1, dh2, connPtd };
    })
  );

  const chains3 = tripletResults
    .filter(({ dh1, dh2, connPtd }) => dh1 != null && dh2 != null && connPtd != null)
    .map(({ ret, out, conn, dh1, dh2, connPtd }) => {
      const totalMiles = out.htp + out.ptd + dh1 + connPtd + dh2
                       + ret.pickupToDeliveryMiles + ret.deliveryToHomeMiles;
      if (totalMiles < PLAN_DEFAULTS.minTotalMiles || totalMiles > maxTotal) return null;
      return buildChain3({
        outboundLoad:              out.load,
        connectorLoad:             conn,
        returnLoad:                ret.load,
        homeToOutboundPickupMiles: Math.round(out.htp),
        outboundLoadedMiles:       Math.round(out.ptd),
        deadhead1Miles:            Math.round(dh1),
        connectorLoadedMiles:      Math.round(connPtd),
        deadhead2Miles:            Math.round(dh2),
        returnLoadedMiles:         Math.round(ret.pickupToDeliveryMiles),
        deliveryToHomeMiles:       Math.round(ret.deliveryToHomeMiles),
        weekDeadline, hosConfig, rateConfig,
        maxRadiusFromHome: Math.round(out.deliveryToHomeHaversine || 0),
      });
    })
    .filter(Boolean);

  console.log(`[WWP] chains2=${chains.length}, tripletCandidates=${tripletCandidates.length}, chains3=${chains3.length}`);

  // Combine 2-load and 3-load chains, sort by RPM, return top N
  const allChains = [...chains, ...chains3]
    .sort((a, b) => b.revenuePerTotalMile - a.revenuePerTotalMile)
    .slice(0, MAX_CHAINS_RETURNED);

  return {
    chains: allChains,
    returnOnlyOptions: scoredReturns.slice(0, 5).map(s => ({
      load:                   s.load,
      pickupToDeliveryMiles:  s.pickupToDeliveryMiles,
      deliveryToHomeMiles:    s.deliveryToHomeMiles,
      totalMiles:             s.totalMiles,
      revenue:                s.revenue,
      revenuePerMile:         s.revenuePerMile,
    })),
    meta: {
      totalLoadsSearched:      loads.length,
      returnCandidatesFound:   returnCandidates.length,
      outboundCandidatesFound: outboundCandidates.length,
      outboundScoredTop:       scoredOutbounds.length,
      pairsEvaluated:          pairCandidates.length,
      chainsReturned:          allChains.length,
      chains2Found:            chains.length,
      chains3Found:            chains3.length,
    },
  };
};

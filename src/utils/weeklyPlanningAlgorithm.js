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

// Max candidates pre-filtered before PC*MILER calls
const MAX_RETURN_CANDIDATES   = 20;
const MAX_OUTBOUND_CANDIDATES = 20;
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

  // ── 1. Pre-filter candidates (Haversine, no API calls) ─────────────────────

  const returnCandidates = available
    .filter(load => {
      if (!passesEquipment(load, fleetProfile)) return false;
      const d = haversineTo(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng);
      return d == null || d <= homeRadiusMiles; // include no-coord loads; PC*MILER decides
    })
    .slice(0, MAX_RETURN_CANDIDATES);

  const outboundCandidates = available
    .filter(load => {
      if (!passesEquipment(load, fleetProfile)) return false;
      const d = haversineTo(load.pickup_lat, load.pickup_lng, fleetHome.lat, fleetHome.lng);
      return d == null || d <= homeRadiusMiles;
    })
    .slice(0, MAX_OUTBOUND_CANDIDATES);

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

  const scoredReturns = returnDistances
    .filter(({ ptd, dth }) => ptd != null && dth != null)
    // Strict 150mi cap on delivery-to-home — catches null-coord loads that bypassed Haversine
    .filter(({ dth }) => dth <= homeRadiusMiles)
    .filter(({ ptd, dth }) => {
      const legMiles = ptd + dth;
      return legMiles >= PLAN_DEFAULTS.minTotalMiles
          && legMiles <= PLAN_DEFAULTS.maxReturnLegMiles;
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

  return {
    chains,
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
      chainsReturned:          chains.length,
    },
  };
};

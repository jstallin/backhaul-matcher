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

// Haversine formula to calculate distance between two points
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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
const calculateNetRevenue = (totalRevenue, additionalMiles, rateConfig) => {
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
  rateConfig = null
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
  const directReturnMiles = routeData?.distanceMiles
    ?? calculateDistance(datumPoint.lat, datumPoint.lng, fleetHome.lat, fleetHome.lng);

  console.log('Direct return miles:', directReturnMiles, routeData?.distanceMiles ? '(PC Miler)' : '(Haversine)');

  // ---- FAST FILTER: equipment + corridor + Haversine pre-check (no API calls) ----
  const availableLoads = backhaulLoads.filter(load => load.status === 'available');
  const corridorCandidates = [];

  for (const load of availableLoads) {
    // 1. Equipment compatibility
    if (load.equipment_type !== fleetProfile.trailerType) continue;
    if (load.trailer_length > fleetProfile.trailerLength) continue;
    if (load.weight_lbs > fleetProfile.weightLimit) continue;

    // 2. Quick Haversine pre-filter: delivery must be near home
    // Use 1.5x homeRadius since driving distance is always longer than Haversine
    const haversineDeliveryToHome = calculateDistance(
      load.delivery_lat, load.delivery_lng,
      fleetHome.lat, fleetHome.lng
    );
    if (haversineDeliveryToHome > homeRadiusMiles * 1.5) continue;

    // 3. Corridor check (no API call — Turf.js polygon or Haversine fallback)
    let isPickupAlongRoute;
    if (useCorridor) {
      isPickupAlongRoute = isPointInCorridor(
        load.pickup_lat, load.pickup_lng,
        routeData.corridor
      );
    } else {
      isPickupAlongRoute = isAlongRoute(
        load.pickup_lat, load.pickup_lng,
        datumPoint.lat, datumPoint.lng,
        fleetHome.lat, fleetHome.lng,
        corridorWidthMiles
      );
    }
    if (!isPickupAlongRoute) continue;

    corridorCandidates.push(load);
  }

  console.log(`Corridor filter: ${corridorCandidates.length} candidates from ${availableLoads.length} available loads`);

  // Cap candidates to avoid excessive API calls (pre-sort by Haversine estimate)
  const maxCandidates = 50;
  let candidatesToProcess = corridorCandidates;
  if (corridorCandidates.length > maxCandidates) {
    corridorCandidates.sort((a, b) => {
      const aDeliveryDist = calculateDistance(a.delivery_lat, a.delivery_lng, fleetHome.lat, fleetHome.lng);
      const bDeliveryDist = calculateDistance(b.delivery_lat, b.delivery_lng, fleetHome.lat, fleetHome.lng);
      return aDeliveryDist - bDeliveryDist;
    });
    candidatesToProcess = corridorCandidates.slice(0, maxCandidates);
    console.log(`Capped to ${maxCandidates} candidates for PC Miler distance calls`);
  }

  // ---- PRECISE DISTANCES: Call PC Miler in batches to avoid rate limiting ----
  const batchSize = 5; // Process 5 loads at a time (15 API calls per batch)
  const distanceResults = [];

  for (let i = 0; i < candidatesToProcess.length; i += batchSize) {
    const batch = candidatesToProcess.slice(i, i + batchSize);
    const batchPromises = batch.map(async (load) => {
      try {
        const [dtp, ptd, dth] = await Promise.all([
          getDrivingDistance([datumPoint, { lat: load.pickup_lat, lng: load.pickup_lng }]),
          getDrivingDistance([
            { lat: load.pickup_lat, lng: load.pickup_lng },
            { lat: load.delivery_lat, lng: load.delivery_lng }
          ]),
          getDrivingDistance([
            { lat: load.delivery_lat, lng: load.delivery_lng },
            fleetHome
          ])
        ]);
        return { load, dtp, ptd, dth };
      } catch (error) {
        console.warn(`PC Miler distance failed for load ${load.load_id}:`, error.message);
        return { load, dtp: null, ptd: null, dth: null };
      }
    });
    const batchResults = await Promise.all(batchPromises);
    distanceResults.push(...batchResults);
  }

  // ---- SCORE with real driving distances ----
  for (const { load, dtp, ptd, dth } of distanceResults) {
    // Fall back to Haversine if PC Miler failed for any leg
    const datumToPickup = dtp ?? calculateDistance(
      datumPoint.lat, datumPoint.lng, load.pickup_lat, load.pickup_lng
    );
    const pickupToDelivery = ptd ?? (load.distance_miles || calculateDistance(
      load.pickup_lat, load.pickup_lng, load.delivery_lat, load.delivery_lng
    ));
    const deliveryToHome = dth ?? calculateDistance(
      load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng
    );

    // Re-check delivery-to-home with real driving distance
    if (deliveryToHome > homeRadiusMiles) continue;

    // Guard against NaN — skip load if any distance is not a valid number
    if (isNaN(datumToPickup) || isNaN(pickupToDelivery) || isNaN(deliveryToHome)) {
      console.warn(`Skipping load ${load.load_id}: invalid distance (dtp=${datumToPickup}, ptd=${pickupToDelivery}, dth=${deliveryToHome})`);
      continue;
    }

    const totalMilesWithBackhaul = datumToPickup + pickupToDelivery + deliveryToHome;
    const additionalMiles = Math.max(0, totalMilesWithBackhaul - directReturnMiles);

    // Calculate value metrics
    const totalRevenue = load.total_revenue || 0;
    const revenuePerMile = totalMilesWithBackhaul > 0 ? totalRevenue / totalMilesWithBackhaul : 0;
    const revenuePerAdditionalMile = additionalMiles > 0 ? totalRevenue / additionalMiles : totalRevenue * 100;

    // Efficiency score - rewards high revenue with low deviation from direct route
    const efficiencyScore = revenuePerMile * (directReturnMiles / totalMilesWithBackhaul) * 100;

    // Calculate net revenue if rate config is available
    const netRevenue = rateConfig
      ? calculateNetRevenue(totalRevenue, additionalMiles, rateConfig)
      : { has_rate_config: false };

    // Track whether we got real driving distances
    const usedPCMiler = dtp !== null && ptd !== null && dth !== null;

    opportunities.push({
      ...load,
      // Route metrics
      datum_to_pickup_miles: Math.round(datumToPickup),
      pickup_to_delivery_miles: Math.round(pickupToDelivery),
      delivery_to_home_miles: Math.round(deliveryToHome),
      total_miles: Math.round(totalMilesWithBackhaul),
      direct_return_miles: Math.round(directReturnMiles),
      additional_miles: Math.round(additionalMiles),

      // Legacy property mappings for BackhaulResults component
      finalToPickup: Math.round(datumToPickup),
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

      // Ranking category
      is_excellent: efficiencyScore > 50 && additionalMiles < 50,
      is_good: efficiencyScore > 30 && additionalMiles < 100,
      is_acceptable: efficiencyScore > 15
    });
  }

  // Sort: if rate config available, rank by customer net credit first, then carrier revenue
  // Otherwise fall back to efficiency score
  if (rateConfig) {
    opportunities.sort((a, b) => {
      const creditDiff = (b.customer_net_credit || 0) - (a.customer_net_credit || 0);
      if (creditDiff !== 0) return creditDiff;
      return (b.carrier_revenue || 0) - (a.carrier_revenue || 0);
    });
  } else {
    opportunities.sort((a, b) => b.efficiency_score - a.efficiency_score);
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
      color: '#D89F38' // Golden amber
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

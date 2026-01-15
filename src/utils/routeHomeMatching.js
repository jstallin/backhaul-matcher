/**
 * Route Home Backhaul Matching Algorithm
 * 
 * This algorithm finds backhaul loads that help get you home from a datum point.
 * It looks for loads along the corridor between the datum point and fleet home.
 */

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

// Check if a point is "along the way" from start to end
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
 * Find backhaul opportunities along the route home
 * 
 * @param {Object} datumPoint - {lat, lng} - Where the driver currently is (or will be)
 * @param {Object} fleetHome - {lat, lng} - Fleet's home base
 * @param {Object} fleetProfile - {trailerType, trailerLength, weightLimit} - Equipment specs
 * @param {Array} backhaulLoads - Available backhaul loads from data
 * @param {Number} homeRadiusMiles - How close to home the delivery should be (default 50)
 * @param {Number} corridorWidthMiles - How far off the direct route is acceptable (default 100)
 * @returns {Array} - Sorted array of matching opportunities
 */
export const findRouteHomeBackhauls = (
  datumPoint,
  fleetHome,
  fleetProfile,
  backhaulLoads,
  homeRadiusMiles = 50,
  corridorWidthMiles = 100
) => {
  const opportunities = [];
  
  // Calculate direct distance from datum to home (empty miles if no backhaul)
  const directReturnMiles = calculateDistance(
    datumPoint.lat, datumPoint.lng,
    fleetHome.lat, fleetHome.lng
  );
  
  // Filter available loads
  const availableLoads = backhaulLoads.filter(load => load.status === 'available');
  
  availableLoads.forEach(load => {
    // 1. Check equipment compatibility
    if (load.equipment_type !== fleetProfile.trailerType) return;
    if (load.trailer_length > fleetProfile.trailerLength) return;
    if (load.weight_lbs > fleetProfile.weightLimit) return;
    
    // 2. Check if pickup is along the route home (within corridor)
    const isPickupAlongRoute = isAlongRoute(
      load.pickup_lat, load.pickup_lng,
      datumPoint.lat, datumPoint.lng,
      fleetHome.lat, fleetHome.lng,
      corridorWidthMiles
    );
    
    if (!isPickupAlongRoute) return;
    
    // 3. Check if delivery is near home (within homeRadiusMiles)
    const deliveryToHome = calculateDistance(
      load.delivery_lat, load.delivery_lng,
      fleetHome.lat, fleetHome.lng
    );
    
    if (deliveryToHome > homeRadiusMiles) return;
    
    // 4. Calculate miles
    const datumToPickup = calculateDistance(
      datumPoint.lat, datumPoint.lng,
      load.pickup_lat, load.pickup_lng
    );
    
    const pickupToDelivery = load.distance_miles;
    
    const totalMilesWithBackhaul = datumToPickup + pickupToDelivery + deliveryToHome;
    
    // How many extra miles compared to going straight home empty
    const additionalMiles = totalMilesWithBackhaul - directReturnMiles;
    
    // 5. Calculate value metrics
    const totalRevenue = load.total_revenue;
    const revenuePerMile = totalRevenue / totalMilesWithBackhaul;
    const revenuePerAdditionalMile = additionalMiles > 0 ? totalRevenue / additionalMiles : totalRevenue * 100;
    
    // 6. Calculate "efficiency score" - rewards high revenue with low deviation from direct route
    // Higher score is better
    const efficiencyScore = revenuePerMile * (directReturnMiles / totalMilesWithBackhaul) * 100;
    
    opportunities.push({
      ...load,
      // Route metrics
      datum_to_pickup_miles: Math.round(datumToPickup),
      pickup_to_delivery_miles: Math.round(pickupToDelivery),
      delivery_to_home_miles: Math.round(deliveryToHome),
      total_miles: Math.round(totalMilesWithBackhaul),
      direct_return_miles: Math.round(directReturnMiles),
      additional_miles: Math.round(additionalMiles),
      
      // Value metrics
      revenue_per_mile: revenuePerMile,
      revenue_per_additional_mile: revenuePerAdditionalMile,
      efficiency_score: efficiencyScore,
      
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
  });
  
  // Sort by efficiency score (best opportunities first)
  opportunities.sort((a, b) => b.efficiency_score - a.efficiency_score);
  
  return opportunities;
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

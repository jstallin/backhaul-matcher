import backhaulLoadsData from '../data/backhaul_loads_data.json';

// Haversine formula for distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const findBackhaulOpportunities = (finalStop, fleetHome, fleetProfile, searchRadius, relayMode) => {
  const opportunities = [];
  
  const directReturnMiles = calculateDistance(
    finalStop.lat, finalStop.lng,
    fleetHome.lat, fleetHome.lng
  );

  // Filter and process real backhaul loads
  const availableLoads = backhaulLoadsData.filter(load => load.status === 'available');

  availableLoads.forEach(load => {
    // Match equipment type
    const loadEquipmentType = load.equipment_type;
    if (loadEquipmentType !== fleetProfile.trailerType) return;
    
    // Check trailer length compatibility
    if (load.trailer_length > fleetProfile.trailerLength) return;
    
    // Check weight compatibility
    if (load.weight_lbs > fleetProfile.weightLimit) return;

    // Calculate distance from final stop to load pickup
    const finalToPickup = calculateDistance(
      finalStop.lat, finalStop.lng,
      load.pickup_lat, load.pickup_lng
    );

    // Skip if pickup is outside search radius
    if (finalToPickup > searchRadius) return;

    // Calculate total revenue (already in the load data)
    const totalRevenue = load.total_revenue;

    // Calculate out-of-route miles
    let oorMiles;
    if (relayMode) {
      // Relay mode: Final → Pickup → Home → Delivery → Home
      const pickupToHome = calculateDistance(
        load.pickup_lat, load.pickup_lng, 
        fleetHome.lat, fleetHome.lng
      );
      const homeToDelivery = calculateDistance(
        fleetHome.lat, fleetHome.lng, 
        load.delivery_lat, load.delivery_lng
      );
      const deliveryToHome = calculateDistance(
        load.delivery_lat, load.delivery_lng, 
        fleetHome.lat, fleetHome.lng
      );
      oorMiles = finalToPickup + pickupToHome + homeToDelivery + deliveryToHome;
    } else {
      // Standard mode: Final → Pickup → Delivery → Home
      const pickupToDelivery = load.distance_miles;
      const deliveryToHome = calculateDistance(
        load.delivery_lat, load.delivery_lng, 
        fleetHome.lat, fleetHome.lng
      );
      oorMiles = finalToPickup + pickupToDelivery + deliveryToHome;
    }

    const additionalMiles = oorMiles - directReturnMiles;
    const revenuePerMile = totalRevenue / oorMiles;
    const score = revenuePerMile * totalRevenue; // Optimize for revenue per mile AND total revenue

    opportunities.push({
      id: load.load_id,
      origin: {
        address: load.pickup_city,
        lat: load.pickup_lat,
        lng: load.pickup_lng
      },
      destination: {
        address: load.delivery_city,
        lat: load.delivery_lat,
        lng: load.delivery_lng
      },
      equipmentType: load.equipment_type,
      trailerLength: load.trailer_length,
      weight: load.weight_lbs,
      pickupDate: load.pickup_date,
      deliveryDate: load.delivery_date,
      distance: load.distance_miles,
      broker: load.broker,
      shipper: load.shipper,
      receiver: load.receiver,
      freightType: load.freight_type,
      totalRevenue,
      oorMiles: Math.round(oorMiles),
      directReturnMiles: Math.round(directReturnMiles),
      additionalMiles: Math.round(additionalMiles),
      revenuePerMile: parseFloat(revenuePerMile.toFixed(2)),
      score,
      finalToPickup: Math.round(finalToPickup)
    });
  });

  // Sort by score (best opportunities first)
  return opportunities.sort((a, b) => b.score - a.score);
};

// Helper to parse datum point (City, ST or ZIP) to coordinates
// This is a simplified version - in production would use geocoding API
export const parseDatumPoint = (datumPoint) => {
  // For now, we'll use the fleet's home coordinates
  // In production, this would geocode the datum point
  return null;
};

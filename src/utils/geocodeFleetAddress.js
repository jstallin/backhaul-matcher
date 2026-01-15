import { parseDatumPoint } from './mapboxGeocoding';

/**
 * Geocode a fleet home address to get lat/lng coordinates
 * Extracts city and state from full address and geocodes it
 */
export const geocodeFleetAddress = async (address) => {
  if (!address) {
    console.error('No address provided to geocode');
    return { lat: null, lng: null };
  }

  try {
    // Try to extract city and state from address
    // Examples: "12826 Robert Walker Dr Davidson, NC 28036"
    //           "123 Main St, Charlotte, NC 28202"
    
    // Match pattern: "City, STATE" or "City, STATE ZIP"
    const cityStateMatch = address.match(/,\s*([A-Za-z\s]+),?\s*([A-Z]{2})/);
    
    if (cityStateMatch) {
      const city = cityStateMatch[1].trim();
      const state = cityStateMatch[2].trim();
      const searchString = `${city}, ${state}`;
      
      console.log(`Geocoding fleet address: "${address}" → "${searchString}"`);
      
      const result = await parseDatumPoint(searchString);
      
      if (result && result.lat && result.lng) {
        console.log(`✅ Geocoded to: ${result.lat}, ${result.lng}`);
        return { lat: result.lat, lng: result.lng };
      }
    }
    
    // Fallback: try the full address
    console.log(`Trying full address: "${address}"`);
    const result = await parseDatumPoint(address);
    
    if (result && result.lat && result.lng) {
      console.log(`✅ Geocoded full address to: ${result.lat}, ${result.lng}`);
      return { lat: result.lat, lng: result.lng };
    }
    
    console.error(`❌ Failed to geocode address: "${address}"`);
    return { lat: null, lng: null };
    
  } catch (error) {
    console.error('Error geocoding fleet address:', error);
    return { lat: null, lng: null };
  }
};

/**
 * Update existing fleet with geocoded home coordinates
 */
export const updateFleetCoordinates = async (db, fleetId, address) => {
  const coords = await geocodeFleetAddress(address);
  
  if (coords.lat && coords.lng) {
    try {
      await db.fleets.update(fleetId, {
        home_lat: coords.lat,
        home_lng: coords.lng
      });
      console.log(`✅ Updated fleet ${fleetId} with coordinates`);
      return true;
    } catch (error) {
      console.error('Error updating fleet coordinates:', error);
      return false;
    }
  }
  
  return false;
};

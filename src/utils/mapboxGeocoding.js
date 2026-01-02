// Mapbox Geocoding API Service
// Documentation: https://docs.mapbox.com/api/search/geocoding/

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEOCODING_API = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

// Fallback local geocoding for common NC and FL locations (used if Mapbox token not configured)
const NC_CITIES = {
  'davidson': { lat: 35.4993, lng: -80.8487, city: 'Davidson, NC' },
  'charlotte': { lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC' },
  'raleigh': { lat: 35.7796, lng: -78.6382, city: 'Raleigh, NC' },
  'greensboro': { lat: 36.0726, lng: -79.7920, city: 'Greensboro, NC' },
  'durham': { lat: 35.9940, lng: -78.8986, city: 'Durham, NC' },
  'winston-salem': { lat: 36.0999, lng: -80.2442, city: 'Winston-Salem, NC' },
  'fayetteville': { lat: 35.0527, lng: -78.8784, city: 'Fayetteville, NC' },
  'cary': { lat: 35.7915, lng: -78.7811, city: 'Cary, NC' },
  'wilmington': { lat: 34.2257, lng: -77.9447, city: 'Wilmington, NC' },
  'high point': { lat: 35.9557, lng: -80.0053, city: 'High Point, NC' },
  'concord': { lat: 35.4087, lng: -80.5795, city: 'Concord, NC' },
  'gastonia': { lat: 35.2621, lng: -81.1873, city: 'Gastonia, NC' },
  'monroe': { lat: 34.9854, lng: -80.5495, city: 'Monroe, NC' },
  'mooresville': { lat: 35.5849, lng: -80.8101, city: 'Mooresville, NC' },
  'huntersville': { lat: 35.4107, lng: -80.8428, city: 'Huntersville, NC' },
  'kannapolis': { lat: 35.4873, lng: -80.6217, city: 'Kannapolis, NC' },
  'cornelius': { lat: 35.4862, lng: -80.8590, city: 'Cornelius, NC' },
  'matthews': { lat: 35.1168, lng: -80.7237, city: 'Matthews, NC' },
  'burlington': { lat: 36.0957, lng: -79.4378, city: 'Burlington, NC' },
  // Florida cities
  'alachua': { lat: 29.7377, lng: -82.4248, city: 'Alachua, FL' },
  'gainesville': { lat: 29.6516, lng: -82.3248, city: 'Gainesville, FL' },
  'jacksonville': { lat: 30.3322, lng: -81.6557, city: 'Jacksonville, FL' },
  'tampa': { lat: 27.9506, lng: -82.4572, city: 'Tampa, FL' },
  'orlando': { lat: 28.5383, lng: -81.3792, city: 'Orlando, FL' },
  'lakeland': { lat: 28.0395, lng: -81.9498, city: 'Lakeland, FL' },
  'ocala': { lat: 29.1872, lng: -82.1401, city: 'Ocala, FL' },
  'palatka': { lat: 29.6486, lng: -81.6373, city: 'Palatka, FL' },
  'lake city': { lat: 30.1896, lng: -82.6393, city: 'Lake City, FL' },
  'st. augustine': { lat: 29.9012, lng: -81.3124, city: 'St. Augustine, FL' }
};

const ZIP_TO_COORDS = {
  '28036': { lat: 35.4993, lng: -80.8487, city: 'Davidson, NC' },
  '28216': { lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC' },
  '27601': { lat: 35.7796, lng: -78.6382, city: 'Raleigh, NC' },
  '27401': { lat: 36.0726, lng: -79.7920, city: 'Greensboro, NC' },
  // Florida zip codes
  '32615': { lat: 29.7377, lng: -82.4248, city: 'Alachua, FL' },
  '32601': { lat: 29.6516, lng: -82.3248, city: 'Gainesville, FL' },
  '32099': { lat: 30.3322, lng: -81.6557, city: 'Jacksonville, FL' }
};

/**
 * Geocode an address using Mapbox Geocoding API
 * @param {string} address - Address, city, or ZIP code to geocode
 * @returns {Promise<{lat: number, lng: number, city: string} | null>}
 */
export const geocodeAddress = async (address) => {
  if (!address || !address.trim()) {
    return null;
  }

  // If Mapbox token is not configured, use fallback
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'your_mapbox_public_token') {
    console.warn('Mapbox token not configured, using fallback geocoding');
    return fallbackGeocode(address);
  }

  try {
    // Encode the address for URL
    const encodedAddress = encodeURIComponent(address.trim());
    
    // Build Mapbox API URL
    // Bias results to North Carolina by providing proximity parameter
    const url = `${GEOCODING_API}/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&proximity=-80.8431,35.2271&country=US&limit=1`;
    
    console.log('Geocoding with Mapbox:', address);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      console.warn('No results from Mapbox, trying fallback');
      return fallbackGeocode(address);
    }
    
    const feature = data.features[0];
    const [lng, lat] = feature.center;
    const city = feature.place_name;
    
    console.log('Geocoded successfully:', { address, result: { lat, lng, city } });
    
    return {
      lat,
      lng,
      city
    };
    
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    console.log('Falling back to local geocoding');
    return fallbackGeocode(address);
  }
};

/**
 * Fallback geocoding using local city/ZIP lookup
 * @param {string} address - Address to geocode
 * @returns {{lat: number, lng: number, city: string} | null}
 */
const fallbackGeocode = (address) => {
  if (!address) return null;

  const cleaned = address.toLowerCase().trim();
  
  // Try to match city name
  for (const [key, value] of Object.entries(NC_CITIES)) {
    if (cleaned.includes(key)) {
      console.log('Matched city via fallback:', key);
      return value;
    }
  }

  // Check for ZIP code pattern (5 digits)
  const zipMatch = cleaned.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    if (ZIP_TO_COORDS[zip]) {
      console.log('Matched ZIP via fallback:', zip);
      return ZIP_TO_COORDS[zip];
    }
  }

  // Could not geocode
  console.warn('Could not geocode address:', address);
  return null;
};

/**
 * Parse datum point - convenience wrapper around geocodeAddress
 * @param {string} datumPoint - Datum point from request
 * @returns {Promise<{lat: number, lng: number, city: string} | null>}
 */
export const parseDatumPoint = async (datumPoint) => {
  return await geocodeAddress(datumPoint);
};

/**
 * Batch geocode multiple addresses
 * Note: Mapbox has rate limits, so be careful with batch requests
 * @param {string[]} addresses - Array of addresses to geocode
 * @returns {Promise<Array<{address: string, result: {lat, lng, city} | null}>>}
 */
export const batchGeocode = async (addresses) => {
  const results = [];
  
  // Process sequentially to avoid rate limits
  for (const address of addresses) {
    const result = await geocodeAddress(address);
    results.push({ address, result });
    
    // Small delay to avoid rate limiting (50 requests/second max)
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return results;
};

/**
 * Reverse geocode coordinates to an address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string | null>}
 */
export const reverseGeocode = async (lat, lng) => {
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'your_mapbox_public_token') {
    console.warn('Mapbox token not configured, cannot reverse geocode');
    return null;
  }

  try {
    const url = `${GEOCODING_API}/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return null;
    }
    
    return data.features[0].place_name;
    
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};

// Simple geocoding for common NC locations
// In production, this would use a real geocoding API like Google Maps, Mapbox, etc.

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
  'burlington': { lat: 36.0957, lng: -79.4378, city: 'Burlington, NC' }
};

// Parse datum point and return coordinates
export const parseDatumPoint = (datumPoint) => {
  if (!datumPoint) return null;

  // Clean up the input
  const cleaned = datumPoint.toLowerCase().trim();
  
  // Try to match city name
  for (const [key, value] of Object.entries(NC_CITIES)) {
    if (cleaned.includes(key)) {
      return value;
    }
  }

  // Check for ZIP code pattern (5 digits)
  const zipMatch = cleaned.match(/\b(\d{5})\b/);
  if (zipMatch) {
    // Map some common Davidson area ZIP codes
    const ZIP_TO_COORDS = {
      '28036': { lat: 35.4993, lng: -80.8487, city: 'Davidson, NC' },
      '28216': { lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC' },
      '27601': { lat: 35.7796, lng: -78.6382, city: 'Raleigh, NC' },
      '27401': { lat: 36.0726, lng: -79.7920, city: 'Greensboro, NC' }
    };
    
    const zip = zipMatch[1];
    if (ZIP_TO_COORDS[zip]) {
      return ZIP_TO_COORDS[zip];
    }
  }

  // If we can't geocode it, return null
  // Caller should fall back to fleet home
  return null;
};

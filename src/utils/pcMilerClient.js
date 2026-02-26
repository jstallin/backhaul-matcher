/**
 * PC Miler Client
 *
 * Client-side wrapper for PC Miler API calls via Vercel serverless proxies.
 * All calls go through /api/pcmiler/* to keep the API key server-side.
 */

/**
 * Format coordinates for PC Miler stops parameter.
 * PC Miler uses longitude,latitude format (same as GeoJSON).
 * Multiple stops separated by semicolons.
 *
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {string} e.g. "-85.7585,38.2527;-82.3535,36.3134"
 */
export const formatStops = (points) => {
  return points.map(p => `${p.lng},${p.lat}`).join(';');
};

/**
 * Get driving distance in miles between two or more points.
 * Uses PC Miler Route Reports API via server proxy.
 *
 * @param {Array<{lat: number, lng: number}>} points - 2+ points
 * @returns {Promise<number|null>} Total driving distance in miles, or null on failure
 */
export const getDrivingDistance = async (points) => {
  try {
    const stops = formatStops(points);
    const response = await fetch(`/api/pcmiler/route?stops=${encodeURIComponent(stops)}&reports=Mileage`);

    if (!response.ok) {
      console.warn(`PC Miler route API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    // PC Miler returns array of report sets. Each set has ReportLines.
    // The last ReportLine in the Mileage report contains the total.
    if (data && Array.isArray(data) && data.length > 0) {
      const reportSet = data[0];

      // Look for MileageReport in the response
      if (reportSet.ReportLines) {
        const lines = reportSet.ReportLines;
        const totalLine = lines[lines.length - 1];
        if (totalLine?.TMiles != null) {
          return totalLine.TMiles;
        }
      }

      // Alternative format: nested report types
      if (reportSet.MileageReport) {
        const lines = reportSet.MileageReport.ReportLines || reportSet.MileageReport;
        if (Array.isArray(lines)) {
          const totalLine = lines[lines.length - 1];
          if (totalLine?.TMiles != null) {
            return totalLine.TMiles;
          }
        }
      }
    }

    // Try flat object format
    if (data && !Array.isArray(data) && data.TMiles != null) {
      return data.TMiles;
    }

    console.warn('Could not extract miles from PC Miler response:', JSON.stringify(data).slice(0, 500));
    return null;
  } catch (error) {
    console.error('Error fetching PC Miler driving distance:', error);
    return null;
  }
};

/**
 * Get driving route geometry (GeoJSON) between two or more points.
 * Uses PC Miler Route Path API via server proxy.
 *
 * @param {Array<{lat: number, lng: number}>} points - 2+ points
 * @returns {Promise<Object|null>} GeoJSON LineString geometry, or null on failure
 */
export const getRouteGeometry = async (points) => {
  try {
    const stops = formatStops(points);
    const response = await fetch(`/api/pcmiler/routepath?stops=${encodeURIComponent(stops)}`);

    if (!response.ok) {
      console.warn(`PC Miler routepath API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    // PC Miler routePath returns GeoJSON — could be FeatureCollection, Feature, or raw geometry
    let geometry = null;

    if (data?.type === 'FeatureCollection' && data.features?.length > 0) {
      geometry = data.features[0].geometry;
    } else if (data?.type === 'Feature' && data.geometry) {
      geometry = data.geometry;
    } else if (data?.type === 'MultiLineString' || data?.type === 'LineString') {
      geometry = data;
    } else if (data?.coordinates) {
      geometry = data;
    }

    if (!geometry) {
      console.warn('Could not extract geometry from PC Miler response:', JSON.stringify(data).slice(0, 500));
      return null;
    }

    // Normalize MultiLineString to LineString for Turf.js buffer compatibility
    if (geometry.type === 'MultiLineString') {
      const flatCoords = geometry.coordinates.flat();
      return { type: 'LineString', coordinates: flatCoords };
    }

    return geometry;
  } catch (error) {
    console.error('Error fetching PC Miler route geometry:', error);
    return null;
  }
};

/**
 * Get both driving distance and route geometry in parallel.
 *
 * @param {Array<{lat: number, lng: number}>} points - 2+ points
 * @returns {Promise<{distance: number|null, geometry: Object|null}>}
 */
export const getRouteWithDistance = async (points) => {
  const [distance, geometry] = await Promise.all([
    getDrivingDistance(points),
    getRouteGeometry(points)
  ]);
  return { distance, geometry };
};

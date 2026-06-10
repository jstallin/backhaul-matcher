/**
 * PC Miler Client
 *
 * Client-side wrapper for PC Miler API calls via Vercel serverless proxies.
 * All calls go through /api/pcmiler/* to keep the API key server-side.
 */

import { supabase } from '../lib/supabase';

// Server-side (Vercel cron / serverless) there is no browser, no user session, and
// relative `/api/pcmiler/*` URLs don't resolve. In that context we call PC*MILER's
// REST API directly with the server-only PCMILER_API_KEY — the same pattern the
// proxies use internally. The client path is unchanged (proxy + user JWT).
const IS_SERVER = typeof window === 'undefined';
const PCMILER_BASE = 'https://pcmiler.alk.com/apis/rest/v1.0/Service.svc';
const serverPcMilerToken = () => (typeof process !== 'undefined' ? process.env.PCMILER_API_KEY : null);

// #87: the /api/pcmiler/* proxies now require a valid session (they spend the billed
// PC*MILER key). Attach the current user's access token to each request. getSession()
// reads from local storage (no network) so this is cheap. Returns {} when signed out;
// the proxy then responds 401 and callers fall back gracefully (null / []).
const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
};

/**
 * Format coordinates for PC Miler stops parameter.
 * PC Miler uses longitude,latitude format (same as GeoJSON).
 * Multiple stops separated by semicolons.
 *
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {string} e.g. "-85.7585,38.2527;-82.3535,36.3134"
 */
export const formatStops = (points) => {
  return points.map(p => {
    if (p.city && p.state) return `${p.city},${p.state},US`;
    return `${p.lng},${p.lat}`;
  }).join(';');
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
    let response;
    if (IS_SERVER) {
      const token = serverPcMilerToken();
      if (!token) return null;
      response = await fetch(`${PCMILER_BASE}/route/routeReports?stops=${encodeURIComponent(stops)}&reports=Mileage&authToken=${token}`);
    } else {
      response = await fetch(`/api/pcmiler/route?stops=${encodeURIComponent(stops)}&reports=Mileage`, { headers: await authHeaders() });
    }

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
          return Number(totalLine.TMiles);
        }
      }

      // Alternative format: nested report types
      if (reportSet.MileageReport) {
        const lines = reportSet.MileageReport.ReportLines || reportSet.MileageReport;
        if (Array.isArray(lines)) {
          const totalLine = lines[lines.length - 1];
          if (totalLine?.TMiles != null) {
            return Number(totalLine.TMiles);
          }
        }
      }
    }

    // Try flat object format
    if (data && !Array.isArray(data) && data.TMiles != null) {
      return Number(data.TMiles);
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
    let response;
    if (IS_SERVER) {
      const token = serverPcMilerToken();
      if (!token) return null;
      response = await fetch(`${PCMILER_BASE}/route/routePath?stops=${encodeURIComponent(stops)}&authToken=${token}`);
    } else {
      response = await fetch(`/api/pcmiler/routepath?stops=${encodeURIComponent(stops)}`, { headers: await authHeaders() });
    }

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
 * Geocode an address string to lat/lng using PC*MILER via server proxy.
 *
 * @param {string} address - Address, city/state, or full street address
 * @returns {Promise<{lat: number, lng: number, label: string}|null>}
 */
export const geocodeAddress = async (address) => {
  if (!address || !address.trim()) return null;
  try {
    if (IS_SERVER) {
      // Server: call PC*MILER Locations directly (same parse as api/pcmiler/geocode.js).
      const token = serverPcMilerToken();
      if (!token) return null;
      const r = await fetch(`${PCMILER_BASE}/locations?address=${encodeURIComponent(address.trim())}&authToken=${token}`);
      if (!r.ok) return null;
      const data = await r.json();
      const loc = Array.isArray(data) ? data[0] : null;
      if (loc?.Coords?.Lat != null && loc?.Coords?.Lon != null) {
        const label = [loc.Address?.StreetAddress, loc.Address?.City, loc.Address?.State, loc.Address?.Zip]
          .filter(Boolean).join(', ');
        return { lat: Number(loc.Coords.Lat), lng: Number(loc.Coords.Lon), label: label || address.trim() };
      }
      return null;
    }
    const response = await fetch(`/api/pcmiler/geocode?address=${encodeURIComponent(address.trim())}`, { headers: await authHeaders() });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('PC Miler geocode failed:', response.status, err.error);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Error geocoding address via PC Miler:', error);
    return null;
  }
};

/**
 * City/State typeahead suggestions for a typed query (item 002).
 * Returns [] for short/empty queries or on error — callers debounce.
 *
 * @param {string} query
 * @returns {Promise<Array<{ city, state, zip, lat, lng, label }>>}
 */
export const searchCityState = async (query) => {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  try {
    const response = await fetch(`/api/pcmiler/geocode?suggest=1&q=${encodeURIComponent(q)}`, { headers: await authHeaders() });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch (error) {
    console.error('Error fetching city/state suggestions:', error);
    return [];
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

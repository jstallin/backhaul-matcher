/**
 * Route Corridor Service
 *
 * Fetches actual driving routes from Mapbox and creates geographic corridors
 * using Turf.js for proper spatial filtering of backhaul loads.
 */

import * as turf from '@turf/turf';
import usLandPolygon from '../data/us-land-simplified.json';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Cache for routes - key is "lat1,lng1->lat2,lng2" rounded to 3 decimals
const routeCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Generate cache key from origin/destination coordinates
 * Rounds to 3 decimals for cache efficiency
 */
const getCacheKey = (origin, destination) => {
  const round = (n) => Math.round(n * 1000) / 1000;
  return `${round(origin.lat)},${round(origin.lng)}->${round(destination.lat)},${round(destination.lng)}`;
};

/**
 * Check if cached entry is still valid
 */
const isCacheValid = (entry) => {
  return entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS;
};

/**
 * Fetch driving route from Mapbox Directions API
 *
 * @param {Object} origin - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @returns {Object|null} - GeoJSON LineString geometry or null on failure
 */
export const fetchDrivingRoute = async (origin, destination) => {
  try {
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Mapbox Directions API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.routes && data.routes[0] && data.routes[0].geometry) {
      console.log('Route fetched successfully, distance:', Math.round(data.routes[0].distance / 1609), 'miles');
      return data.routes[0].geometry;
    }

    console.warn('No route found in Mapbox response');
    return null;
  } catch (error) {
    console.error('Error fetching driving route:', error);
    return null;
  }
};

/**
 * Clip a polygon to only show over land (exclude oceans)
 *
 * @param {Object} polygon - GeoJSON Polygon geometry
 * @returns {Object} - Clipped GeoJSON geometry (Polygon or MultiPolygon)
 */
const clipToLand = (polygon) => {
  try {
    const corridorFeature = turf.polygon(polygon.coordinates);
    const landFeature = turf.polygon(usLandPolygon.geometry.coordinates);

    const clipped = turf.intersect(turf.featureCollection([corridorFeature, landFeature]));

    if (clipped && clipped.geometry) {
      console.log('Corridor clipped to land boundaries');
      return clipped.geometry;
    }

    // If intersection fails, return original
    console.warn('Land clipping failed, using original corridor');
    return polygon;
  } catch (error) {
    console.error('Error clipping corridor to land:', error);
    return polygon;
  }
};

/**
 * Create a corridor (buffer) around a route line
 *
 * @param {Object} routeLine - GeoJSON LineString geometry
 * @param {Number} widthMiles - Width of corridor in miles (each side)
 * @param {Boolean} clipToLandOnly - Whether to clip corridor to land (default true)
 * @returns {Object|null} - GeoJSON Polygon geometry or null on failure
 */
export const createRouteCorridor = (routeLine, widthMiles, clipToLandOnly = true) => {
  try {
    if (!routeLine || routeLine.type !== 'LineString') {
      console.warn('Invalid route line for corridor creation');
      return null;
    }

    // Create a GeoJSON Feature from the LineString
    const routeFeature = turf.lineString(routeLine.coordinates);

    // Buffer the line by widthMiles (Turf uses kilometers internally)
    const widthKm = widthMiles * 1.60934;
    const corridor = turf.buffer(routeFeature, widthKm, { units: 'kilometers' });

    if (corridor && corridor.geometry) {
      console.log(`Corridor created: ${widthMiles}-mile buffer`);

      // Clip to land if requested
      if (clipToLandOnly) {
        return clipToLand(corridor.geometry);
      }

      return corridor.geometry;
    }

    console.warn('Failed to create corridor buffer');
    return null;
  } catch (error) {
    console.error('Error creating route corridor:', error);
    return null;
  }
};

/**
 * Check if a point is within the corridor polygon
 *
 * @param {Number} lat - Latitude
 * @param {Number} lng - Longitude
 * @param {Object} corridor - GeoJSON Polygon or MultiPolygon geometry
 * @returns {Boolean}
 */
export const isPointInCorridor = (lat, lng, corridor) => {
  try {
    if (!corridor) return false;

    const point = turf.point([lng, lat]);

    // Handle both Polygon and MultiPolygon geometries
    let corridorFeature;
    if (corridor.type === 'MultiPolygon') {
      corridorFeature = turf.multiPolygon(corridor.coordinates);
    } else {
      corridorFeature = turf.polygon(corridor.coordinates);
    }

    return turf.booleanPointInPolygon(point, corridorFeature);
  } catch (error) {
    console.error('Error checking point in corridor:', error);
    return false;
  }
};

/**
 * Get route and corridor with caching
 *
 * @param {Object} datumPoint - {lat, lng} - Starting point
 * @param {Object} fleetHome - {lat, lng} - Destination
 * @param {Number} corridorWidthMiles - Width of corridor in miles (default 50)
 * @returns {Object|null} - { route: GeoJSON LineString, corridor: GeoJSON Polygon } or null
 */
export const getRouteWithCorridor = async (datumPoint, fleetHome, corridorWidthMiles = 50) => {
  const cacheKey = getCacheKey(datumPoint, fleetHome);

  // Check cache first
  const cached = routeCache.get(cacheKey);
  if (isCacheValid(cached) && cached.corridorWidth === corridorWidthMiles) {
    console.log('Using cached route and corridor');
    return cached.data;
  }

  // Fetch fresh route
  console.log('Fetching route from Mapbox...');
  const route = await fetchDrivingRoute(datumPoint, fleetHome);

  if (!route) {
    console.warn('Failed to fetch route, corridor service unavailable');
    return null;
  }

  // Create corridor (with land clipping enabled)
  const corridor = createRouteCorridor(route, corridorWidthMiles, true);

  if (!corridor) {
    console.warn('Failed to create corridor, returning route only');
    return { route, corridor: null };
  }

  const result = { route, corridor };

  // Cache the result
  routeCache.set(cacheKey, {
    data: result,
    corridorWidth: corridorWidthMiles,
    timestamp: Date.now()
  });

  console.log('Route and corridor cached');
  return result;
};

/**
 * Clear the route cache (useful for testing)
 */
export const clearRouteCache = () => {
  routeCache.clear();
  console.log('Route cache cleared');
};

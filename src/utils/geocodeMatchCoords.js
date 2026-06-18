// #164: backfill missing pickup/delivery coordinates for the results map.
// Live loads (Truckstop SOAP) arrive with null lat/lng — the matcher keeps them null so the
// map can geocode from city/state. v1 (OpenRequests) already did this inline; v2 (SearchView)
// didn't, so its markers collapsed onto state centroids and fewer points showed. Shared here
// so both paths behave identically. Fills BOTH the flat (pickup_lat/…) and nested
// (origin/destination) coords so the result map and the load-detail map both have points.
import { geocodeAddress } from './pcMilerClient';

export async function geocodeMissingCoords(matches, limit = 10) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const subset = matches.slice(0, limit);
  if (!subset.some(m => m.pickup_lat == null || m.delivery_lat == null)) return matches;

  // Unique "City,ST" keys needing a lookup (dedupe so shared cities geocode once).
  const cityMap = new Map();
  subset.forEach(m => {
    if (m.pickup_lat == null && m.pickup_city && m.pickup_state) cityMap.set(`${m.pickup_city},${m.pickup_state}`, null);
    if (m.delivery_lat == null && m.delivery_city && m.delivery_state) cityMap.set(`${m.delivery_city},${m.delivery_state}`, null);
  });
  if (cityMap.size === 0) return matches;

  await Promise.all([...cityMap.keys()].map(async (key) => {
    const [city, state] = key.split(',');
    try {
      // #87: geocodeAddress attaches the session token (the proxy requires auth).
      const geo = await geocodeAddress(`${city}, ${state}`);
      if (geo?.lat && geo?.lng) cityMap.set(key, { lat: geo.lat, lng: geo.lng });
    } catch { /* a single geocode failure shouldn't drop the whole map */ }
  }));

  return matches.map(m => {
    const updated = { ...m };
    if (m.pickup_lat == null && m.pickup_city && m.pickup_state) {
      const c = cityMap.get(`${m.pickup_city},${m.pickup_state}`);
      if (c) { updated.pickup_lat = c.lat; updated.pickup_lng = c.lng; updated.origin = { ...(m.origin || {}), lat: c.lat, lng: c.lng }; }
    }
    if (m.delivery_lat == null && m.delivery_city && m.delivery_state) {
      const c = cityMap.get(`${m.delivery_city},${m.delivery_state}`);
      if (c) { updated.delivery_lat = c.lat; updated.delivery_lng = c.lng; updated.destination = { ...(m.destination || {}), lat: c.lat, lng: c.lng }; }
    }
    return updated;
  });
}

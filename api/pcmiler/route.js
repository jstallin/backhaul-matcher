/**
 * PC Miler Route Reports Proxy
 *
 * Proxies requests to PC Miler Route Reports API to keep the API key server-side.
 * Returns mileage data for truck routes between stops.
 *
 * Query params:
 *   stops - Required. Coordinates in lon,lat format separated by semicolons.
 *           Example: -85.7585,38.2527;-82.3535,36.3134
 *   reports - Optional. Comma-separated report types. Default: Mileage
 */
import { createClient } from '@supabase/supabase-js';

// #87: this proxy spends the billed server-side PCMILER_API_KEY, so require a valid
// Supabase session JWT (mirrors api/notifications). The cron calls PC*MILER directly
// and is unaffected.
const supabaseAuth = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function isAuthed(req) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return false;
  const { data: { user }, error } = await supabaseAuth.auth.getUser(h.slice(7));
  return !error && !!user;
}

// #118: stop geocoding. The matching algorithm fires dozens of route legs in
// parallel, and Truckstop loads carry no coordinates — so every leg used to hit
// Nominatim (rate-limited at ~1 req/s, hostile to datacenter bursts), and on
// failure the raw "City,ST,US" string went to PC*MILER routeReports, which only
// accepts coordinates → mass 400s → silent Haversine fallbacks. Now: PC*MILER
// Locations first (same chain as api/pcmiler/geocode.js), structured Nominatim
// fallback, with a module-level promise cache so concurrent legs share one
// lookup per city and warm lambdas reuse results across searches.
const geocodeCache = new Map();

function geocodeStop(stop, token) {
  const trimmed = stop.trim();
  // Already coordinates: "-86.123,41.456"
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmed)) return Promise.resolve(trimmed);
  const key = trimmed.toLowerCase();
  if (!geocodeCache.has(key)) {
    const p = resolveCityStateStop(trimmed, token).then(
      coords => { if (!coords) geocodeCache.delete(key); return coords; }, // don't cache failures
      err => { geocodeCache.delete(key); throw err; }
    );
    geocodeCache.set(key, p);
  }
  return geocodeCache.get(key);
}

async function resolveCityStateStop(stop, token) {
  // "City,State,US" format
  const parts = stop.split(',').map(s => s.trim());
  const city = parts[0];
  const state = parts[1];
  if (!city || !state) return null;

  // 1. PC*MILER Locations — same key as the route call, no third-party quota
  try {
    const r = await fetch(
      `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/locations?address=${encodeURIComponent(`${city}, ${state}`)}&authToken=${token}`
    );
    if (r.ok) {
      const data = await r.json();
      const coords = Array.isArray(data) ? data[0]?.Coords : null;
      if (coords?.Lat != null && coords?.Lon != null) return `${coords.Lon},${coords.Lat}`;
    }
  } catch (e) {
    console.warn('PC Miler Locations geocode failed for stop:', stop, e.message);
  }

  // 2. Nominatim structured fallback (avoids matching counties over cities)
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&countrycodes=us&format=json&limit=1`,
      { headers: { 'User-Agent': 'HaulMonitor/1.0' } }
    );
    if (r.ok) {
      const data = await r.json();
      if (data[0]?.lat && data[0]?.lon) return `${data[0].lon},${data[0].lat}`;
    }
  } catch (e) {
    console.warn('Nominatim geocode failed for stop:', stop, e.message);
  }
  return null;
}

export default async function handler(req, res) {
  if (!(await isAuthed(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;
  if (!PCMILER_TOKEN) {
    return res.status(500).json({ error: 'PC Miler API key not configured' });
  }

  const { stops, reports = 'Mileage' } = req.query;
  if (!stops) {
    return res.status(400).json({ error: 'stops parameter required' });
  }

  try {
    // Resolve any city/state stops to coordinates (#118: PC*MILER-first, cached)
    const rawStops = stops.split(';');
    const resolvedStops = await Promise.all(rawStops.map(s => geocodeStop(s, PCMILER_TOKEN)));

    // PC*MILER routeReports only accepts coordinates — a raw city string would 400
    // anyway, so fail fast with a clear error. Callers treat any !ok as "no precise
    // distance" and fall back to Haversine, same as before.
    const badIdx = resolvedStops.findIndex(s => !s);
    if (badIdx !== -1) {
      console.warn('Route proxy: could not geocode stop:', rawStops[badIdx]);
      return res.status(422).json({ error: `Could not geocode stop "${rawStops[badIdx]}"` });
    }
    const resolvedStopsStr = resolvedStops.join(';');

    if (resolvedStopsStr !== stops) {
      console.log('Route proxy: resolved stops from', stops, 'to', resolvedStopsStr);
    }

    const url = `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/route/routeReports?stops=${encodeURIComponent(resolvedStopsStr)}&reports=${encodeURIComponent(reports)}&authToken=${PCMILER_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error('PC Miler route API error:', response.status, text);
      return res.status(response.status).json({ error: `PC Miler API returned ${response.status}`, details: text });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('PC Miler route proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

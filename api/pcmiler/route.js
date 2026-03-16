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
export default async function handler(req, res) {
  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;
  if (!PCMILER_TOKEN) {
    return res.status(500).json({ error: 'PC Miler API key not configured' });
  }

  const { stops, reports = 'Mileage' } = req.query;
  if (!stops) {
    return res.status(400).json({ error: 'stops parameter required' });
  }

  // Geocode any city/state stops (e.g. "Logansport,IN,US") to lng,lat format
  // PC*Miler routeReports only accepts coordinate format
  const geocodeCityState = async (stop) => {
    // Already coordinates: "-86.123,41.456"
    if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(stop.trim())) return stop.trim();
    // City,State,US format → geocode via Nominatim
    const parts = stop.split(',').map(s => s.trim());
    const city = parts[0];
    const state = parts[1];
    if (!city || !state) return stop;
    try {
      const q = encodeURIComponent(`${city}, ${state}, United States`);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
        { headers: { 'User-Agent': 'HaulMonitor/1.0' } }
      );
      if (r.ok) {
        const data = await r.json();
        if (data[0]?.lat && data[0]?.lon) {
          return `${data[0].lon},${data[0].lat}`;
        }
      }
    } catch (e) {
      console.warn('Nominatim geocode failed for stop:', stop, e.message);
    }
    return stop; // return original if geocoding fails
  };

  try {
    // Resolve any city/state stops to coordinates
    const rawStops = stops.split(';');
    const resolvedStops = await Promise.all(rawStops.map(geocodeCityState));
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

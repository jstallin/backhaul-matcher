/**
 * PC Miler Route Path Proxy
 *
 * Proxies requests to PC Miler Route Path API to keep the API key server-side.
 * Returns GeoJSON geometry (MultiLineString) for the truck route.
 *
 * Query params:
 *   stops - Required. Coordinates in lon,lat format separated by semicolons.
 *           Example: -85.7585,38.2527;-82.3535,36.3134
 */
export default async function handler(req, res) {
  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;
  if (!PCMILER_TOKEN) {
    return res.status(500).json({ error: 'PC Miler API key not configured' });
  }

  const { stops } = req.query;
  if (!stops) {
    return res.status(400).json({ error: 'stops parameter required' });
  }

  try {
    const url = `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/route/routePath?stops=${encodeURIComponent(stops)}&authToken=${PCMILER_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error('PC Miler routepath API error:', response.status, text);
      return res.status(response.status).json({ error: `PC Miler API returned ${response.status}`, details: text });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('PC Miler routepath proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

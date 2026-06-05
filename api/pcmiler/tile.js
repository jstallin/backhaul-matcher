/**
 * PC Miler Map Tile Proxy
 *
 * Proxies map tile requests to PC Miler to keep the API key server-side.
 * Falls back to OpenStreetMap tiles if PC Miler is unavailable.
 *
 * Query params:
 *   x - Tile X coordinate
 *   y - Tile Y coordinate
 *   z - Zoom level
 *   style - Optional tile style (default: Modern)
 */

// #87: tiles are loaded by the browser via <img>, which can't send an auth header,
// so we can't require a JWT here. Instead, only proxy the billed PC*MILER tile when
// the request originates from our own app (Referer/Origin); everything else degrades
// to free OSM tiles. (The app currently uses OSM directly, so this path is rarely hit.)
const ALLOWED_TILE_HOSTS = [
  'https://haulmonitor.cloud',
  'https://www.haulmonitor.cloud',
  'https://staging.haulmonitor.cloud',
  'https://backhaul-matcher-staging.vercel.app',
  'http://localhost:5173',
];

export default async function handler(req, res) {
  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;
  const { x, y, z, style = 'Modern' } = req.query;

  if (!x || !y || !z) {
    return res.status(400).json({ error: 'x, y, z parameters required' });
  }

  const referrer = req.headers.referer || req.headers.origin || '';
  const fromOurApp = ALLOWED_TILE_HOSTS.some((host) => referrer.startsWith(host));

  if (!PCMILER_TOKEN || !fromOurApp) {
    // No key, or request not from our app → free OSM fallback (no billed PC*MILER call).
    return res.redirect(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
  }

  try {
    const url = `https://pcmiler.alk.com/apis/rest/v1.0/service.svc/maptile?X=${x}&Y=${y}&Z=${z}&Style=${style}&Format=image/png&authtoken=${PCMILER_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Fall back to OSM on error
      return res.redirect(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
    }

    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Tile proxy error:', error.message);
    return res.redirect(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
  }
}

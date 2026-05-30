/**
 * PC*MILER City/State Suggest Proxy (item 002 — typo prevention)
 *
 * Returns a short list of ranked city/state matches for a typed query, so the UI
 * can offer a typeahead instead of accepting raw free text. Reuses the same
 * PC*MILER Locations endpoint as geocode.js (key stays server-side), with a
 * Nominatim fallback. Responses are CDN-cached.
 *
 * Query params:
 *   q     - Required. Partial city text (e.g., "char" or "charlotte, nc")
 *   limit - Optional. Max suggestions (default 6, capped at 10)
 *
 * Returns: { suggestions: [{ city, state, zip, lat, lng, label }] }
 */
export default async function handler(req, res) {
  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;

  const q = (req.query.q || '').trim();
  if (q.length < 3) {
    return res.status(200).json({ suggestions: [] });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 6, 10);

  // Dedupe to one entry per "City, ST" and trim to the limit.
  const dedupe = (rows) => {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (!r.city || !r.state) continue;
      const key = `${r.city.toLowerCase()}|${r.state.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...r, label: `${r.city}, ${r.state}` });
      if (out.length >= limit) break;
    }
    return out;
  };

  try {
    // 1. PC*MILER Locations — returns a ranked array of matches.
    if (PCMILER_TOKEN) {
      const url = `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/locations?address=${encodeURIComponent(q)}&authToken=${PCMILER_TOKEN}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          const rows = data
            .filter(loc => loc?.Address?.City && loc?.Address?.State)
            .map(loc => ({
              city: loc.Address.City,
              state: loc.Address.State,
              zip: loc.Address.Zip || null,
              lat: loc?.Coords?.Lat != null ? Number(loc.Coords.Lat) : null,
              lng: loc?.Coords?.Lon != null ? Number(loc.Coords.Lon) : null,
            }));
          const suggestions = dedupe(rows);
          if (suggestions.length > 0) {
            res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
            return res.status(200).json({ suggestions });
          }
        }
      }
    }

    // 2. Nominatim fallback (no key, any US place). Bias toward cities/towns.
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&addressdetails=1&limit=${limit + 4}`;
    const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': 'HaulMonitor/1.0' } });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      const rows = (Array.isArray(nomData) ? nomData : [])
        .map(p => {
          const a = p.address || {};
          const city = a.city || a.town || a.village || a.hamlet || a.municipality || null;
          const state = US_STATE_ABBR[a.state] || null;
          if (!city || !state) return null;
          return { city, state, zip: a.postcode || null, lat: parseFloat(p.lat), lng: parseFloat(p.lon) };
        })
        .filter(Boolean);
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
      return res.status(200).json({ suggestions: dedupe(rows) });
    }

    return res.status(200).json({ suggestions: [] });
  } catch (error) {
    console.error('PC Miler suggest proxy error:', error);
    return res.status(200).json({ suggestions: [] });
  }
}

// Nominatim returns full state names; map to USPS abbreviations.
const US_STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

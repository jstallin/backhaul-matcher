/**
 * PC*MILER Geocode Proxy
 *
 * Proxies address geocoding to PC*MILER Locations API to keep the API key server-side.
 * Returns lat/lng coordinates for a given address string.
 *
 * Query params:
 *   address - Required. Address string to geocode (e.g., "Davidson, NC" or "123 Main St, Charlotte, NC 28202")
 */
export default async function handler(req, res) {
  const PCMILER_TOKEN = process.env.PCMILER_API_KEY;
  if (!PCMILER_TOKEN) {
    return res.status(500).json({ error: 'PC Miler API key not configured' });
  }

  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: 'address parameter required' });
  }

  // Try to geocode the given address string. If PC*Miler returns 400 (e.g. for
  // a full street address it can't parse), fall back to city/state extracted
  // from the address: "302 Dura Ave, Toledo, OH 43612" → "Toledo, OH"
  const tryGeocode = async (addr) => {
    const url = `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/locations?address=${encodeURIComponent(addr)}&authToken=${PCMILER_TOKEN}`;
    const r = await fetch(url);
    return { response: r, usedAddress: addr };
  };

  try {
    let { response, usedAddress } = await tryGeocode(address);

    // On 400, try stripping to city/state (handles full street addresses)
    if (response.status === 400) {
      const cityStateMatch = address.match(/,\s*([A-Za-z\s]+),\s*([A-Z]{2})\b/);
      if (cityStateMatch) {
        const simplified = `${cityStateMatch[1].trim()}, ${cityStateMatch[2]}`;
        console.log(`PC Miler geocode: retrying "${address}" as "${simplified}"`);
        ({ response, usedAddress } = await tryGeocode(simplified));
      }
    }

    // Try to extract coords from PC*Miler response
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const loc = data[0];
        const lat = loc?.Coords?.Lat;
        const lng = loc?.Coords?.Lon;
        if (lat != null && lng != null) {
          const label = [loc?.Address?.StreetAddress, loc?.Address?.City, loc?.Address?.State, loc?.Address?.Zip]
            .filter(Boolean).join(', ');
          res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
          return res.status(200).json({ lat: Number(lat), lng: Number(lng), label: label || usedAddress });
        }
      }
    } else {
      const text = await response.text();
      console.warn('PC Miler geocode failed, falling back to Nominatim:', response.status, text.slice(0, 200));
    }

    // Fallback: Nominatim (OSM) — no key required, works for any city/address
    const cityStateMatch = address.match(/,\s*([A-Za-z\s]+),\s*([A-Z]{2})\b/);
    const nominatimQuery = cityStateMatch
      ? `${cityStateMatch[1].trim()}, ${cityStateMatch[2]}, United States`
      : `${address}, United States`;

    console.log('Nominatim fallback for:', nominatimQuery);
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nominatimQuery)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'HaulMonitor/1.0' } }
    );
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (nomData[0]?.lat && nomData[0]?.lon) {
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json({
          lat: parseFloat(nomData[0].lat),
          lng: parseFloat(nomData[0].lon),
          label: nomData[0].display_name || address,
          source: 'nominatim'
        });
      }
    }

    return res.status(404).json({ error: 'Could not geocode address' });
  } catch (error) {
    console.error('PC Miler geocode proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

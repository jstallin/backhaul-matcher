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

  try {
    const url = `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/locations?address=${encodeURIComponent(address)}&authToken=${PCMILER_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error('PC Miler geocode API error:', response.status, text);
      return res.status(response.status).json({ error: `PC Miler API returned ${response.status}`, details: text });
    }

    const data = await response.json();

    // PC*MILER returns an array of location matches
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'No location found for that address' });
    }

    const loc = data[0];
    const lat = loc?.Coords?.Lat;
    const lng = loc?.Coords?.Lon;

    if (lat == null || lng == null) {
      console.error('PC Miler geocode: no coordinates in response', JSON.stringify(data).slice(0, 300));
      return res.status(404).json({ error: 'Could not extract coordinates from PC Miler response' });
    }

    const label = [
      loc?.Address?.StreetAddress,
      loc?.Address?.City,
      loc?.Address?.State,
      loc?.Address?.Zip,
    ].filter(Boolean).join(', ');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json({ lat: Number(lat), lng: Number(lng), label: label || address });
  } catch (error) {
    console.error('PC Miler geocode proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

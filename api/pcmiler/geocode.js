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

  // Extract the most likely "City, ST" from an address string.
  // Strategy: find the first ", ST" pattern (two uppercase letters after a comma),
  // then walk backwards through the preceding words to isolate the city name.
  // Handles "City, ST", "Street, City, ST", "Street City, ST", "Street City, ST ZIP", etc.
  const STREET_SUFFIXES = new Set([
    'dr','st','ave','rd','blvd','ln','ct','pl','way','pkwy','hwy','fwy','cir','trl','ste','apt','unit','fl',
  ]);

  // Walk words backwards, collecting city name words until a street suffix or digit is hit.
  const walkBackCity = (words) => {
    const cityWords = [];
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i].toLowerCase().replace(/[.,]$/, '');
      if (/\d/.test(w) || STREET_SUFFIXES.has(w)) break;
      cityWords.unshift(words[i]);
    }
    return cityWords;
  };

  const extractCityState = (addr) => {
    // Prefer two-comma form: "..., City, ST"
    const two = addr.match(/,\s*([A-Za-z][A-Za-z\s]+?)\s*,\s*([A-Z]{2})\b/);
    if (two) return `${two[1].trim()}, ${two[2]}`;

    // One-comma form: find ", ST" then walk back for city
    const commaState = addr.match(/,\s*([A-Z]{2})\b/);
    if (commaState) {
      const state = commaState[1];
      const beforeComma = addr.slice(0, addr.indexOf(commaState[0])).trim();
      const cityWords = walkBackCity(beforeComma.split(/\s+/));
      if (cityWords.length > 0) return `${cityWords.join(' ')}, ${state}`;
    }

    // No-comma form: state abbreviation at end, e.g. "12524 Robert Walker Dr Davidson NC"
    const noCommaState = addr.match(/\b([A-Z]{2})\s*(?:\d{5})?\s*$/);
    if (noCommaState) {
      const state = noCommaState[1];
      const beforeState = addr.slice(0, addr.lastIndexOf(noCommaState[0])).trim();
      const cityWords = walkBackCity(beforeState.split(/\s+/));
      if (cityWords.length > 0) return `${cityWords.join(' ')}, ${state}`;
    }

    return null;
  };

  // Extract a 5-digit ZIP from an address — used as last-resort PC*MILER input.
  const extractZip = (addr) => {
    const m = addr.match(/\b(\d{5})\b/);
    return m ? m[1] : null;
  };

  try {
    let { response, usedAddress } = await tryGeocode(address);

    // On 400, strip to city/state and retry; if that still fails, try ZIP alone
    if (response.status === 400) {
      const simplified = extractCityState(address);
      if (simplified) {
        console.log(`PC Miler geocode: retrying "${address}" as "${simplified}"`);
        ({ response, usedAddress } = await tryGeocode(simplified));
      }
      if (!simplified || response.status === 400) {
        const zip = extractZip(address);
        if (zip) {
          console.log(`PC Miler geocode: retrying "${address}" as ZIP "${zip}"`);
          ({ response, usedAddress } = await tryGeocode(zip));
        }
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
    // Use structured params for city/state to avoid matching counties over cities.
    const cityState = extractCityState(address);
    const zip = extractZip(address);

    let nominatimUrl;
    if (cityState) {
      const [nomCity, nomState] = cityState.split(',').map(s => s.trim());
      nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(nomCity)}&state=${encodeURIComponent(nomState)}&countrycodes=us&format=json&limit=1`;
      console.log('Nominatim fallback (structured):', cityState);
    } else if (zip) {
      nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&countrycodes=us&format=json&limit=1`;
      console.log('Nominatim fallback (ZIP):', zip);
    } else {
      nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', United States')}&format=json&limit=1`;
      console.log('Nominatim fallback (full address):', address);
    }

    const nomRes = await fetch(nominatimUrl, { headers: { 'User-Agent': 'HaulMonitor/1.0' } });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (nomData[0]?.lat && nomData[0]?.lon) {
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json({
          lat: parseFloat(nomData[0].lat),
          lng: parseFloat(nomData[0].lon),
          label: cityState || address,
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

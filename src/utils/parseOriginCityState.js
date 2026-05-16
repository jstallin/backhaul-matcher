const STATE_NAME_TO_ABBR = {
  'Alabama':'al','Alaska':'ak','Arizona':'az','Arkansas':'ar','California':'ca',
  'Colorado':'co','Connecticut':'ct','Delaware':'de','Florida':'fl','Georgia':'ga',
  'Hawaii':'hi','Idaho':'id','Illinois':'il','Indiana':'in','Iowa':'ia','Kansas':'ks',
  'Kentucky':'ky','Louisiana':'la','Maine':'me','Maryland':'md','Massachusetts':'ma',
  'Michigan':'mi','Minnesota':'mn','Mississippi':'ms','Missouri':'mo','Montana':'mt',
  'Nebraska':'ne','Nevada':'nv','New Hampshire':'nh','New Jersey':'nj','New Mexico':'nm',
  'New York':'ny','North Carolina':'nc','North Dakota':'nd','Ohio':'oh','Oklahoma':'ok',
  'Oregon':'or','Pennsylvania':'pa','Rhode Island':'ri','South Carolina':'sc',
  'South Dakota':'sd','Tennessee':'tn','Texas':'tx','Utah':'ut','Vermont':'vt',
  'Virginia':'va','Washington':'wa','West Virginia':'wv','Wisconsin':'wi','Wyoming':'wy',
};

// Parse a raw origin city/state which may be:
//   "Dallas, Dallas County, Texas, United States"  (PC*MILER full label)
//   "7663 sw 170th St Palmetto Bay, fl"            (full street address)
//   "Greensboro, NC"                               (clean city/state)
// Returns { city, state } with a clean city name and lowercase 2-letter state abbr.
export function parseOriginCityState(rawCity, rawState) {
  const parts = (rawCity || '').split(',').map(s => s.trim()).filter(Boolean);
  let city = parts[0] || '';

  // Strip leading street address: "7663 sw 170th St Palmetto Bay" → "Palmetto Bay"
  if (/^\d/.test(city)) {
    const streetMatch = city.match(/\b(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Pkwy|Hwy|Fwy|Loop|Trail|Ter|Trl|Cir|Pike|Pass|Run|Sq)\s+(.+)/i);
    if (streetMatch) city = streetMatch[1].trim();
  }

  // Try rawState first — accept it if it's already a 2-letter code
  let state = (rawState || '').trim().toLowerCase();
  if (state.length === 2 && /^[a-z]{2}$/.test(state)) return { city, state };

  // rawState is a county name or full name — search all parts of rawCity for a state
  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase();
    if (lower.length === 2 && /^[a-z]{2}$/.test(lower)) { state = lower; break; }
    const abbr = STATE_NAME_TO_ABBR[part];
    if (abbr) { state = abbr; break; }
  }

  // Last resort: check rawState as a full state name
  if (!state || state.length !== 2) {
    const abbr = STATE_NAME_TO_ABBR[rawState?.trim() || ''];
    if (abbr) state = abbr;
  }

  return { city, state };
}

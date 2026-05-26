/**
 * Parse city and state from a fleet's home_address string.
 *
 * Handles both compact forms ("Nashville, TN") and verbose Nominatim display_name
 * forms ("Elm St, Charlotte, Mecklenburg County, North Carolina, 28206, United States").
 *
 * Returns { city, state } where state is always a 2-letter abbreviation.
 */

const STATE_ABBREVS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

const STATE_NAMES = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
  'north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI',
  'wyoming':'WY','district of columbia':'DC',
};

export const parseFleetHome = (fleet) => {
  const parts = (fleet.home_address || '').split(',').map(s => s.trim()).filter(Boolean);

  // Strip parts that are definitely not city or state
  const filtered = parts.filter(p => {
    if (/^united states$/i.test(p)) return false;
    if (/^\d{5}(-\d{4})?$/.test(p)) return false;   // ZIP code
    if (/\bcounty\b/i.test(p)) return false;
    if (/\bparish\b/i.test(p)) return false;
    if (/\bborough\b/i.test(p)) return false;
    return true;
  });

  // Scan from the end for a recognisable state
  let state = '';
  let stateIndex = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const p = filtered[i];
    if (STATE_ABBREVS.has(p.toUpperCase())) {
      state = p.toUpperCase();
      stateIndex = i;
      break;
    }
    const abbrev = STATE_NAMES[p.toLowerCase()];
    if (abbrev) {
      state = abbrev;
      stateIndex = i;
      break;
    }
  }

  // City is the part immediately before the state
  const city = stateIndex > 0 ? filtered[stateIndex - 1] : '';

  return { city, state };
};

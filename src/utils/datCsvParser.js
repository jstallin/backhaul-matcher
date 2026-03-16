/**
 * DAT CSV Export Parser
 * Parses the CSV export from DAT One load board into the internal load format.
 * DAT's export headers vary slightly by version — this handles common variations.
 */

// Normalize a header string to a canonical key
const normalizeHeader = (h) => h.trim().toLowerCase().replace(/[\s\-\/]+/g, '_');

// Map normalized DAT headers → internal field names
const HEADER_MAP = {
  age:           'age',
  origin:        'origin',
  orig:          'origin',
  origin_city:   'origin_city',
  orig_city:     'origin_city',
  destination:   'destination',
  dest:          'destination',
  destination_city: 'dest_city',
  dest_city:     'dest_city',
  equip:         'equipment',
  equipment:     'equipment',
  equipment_type:'equipment',
  len:           'length',
  length:        'length',
  wt:            'weight',
  weight:        'weight',
  fp:            'full_partial',
  full_partial:  'full_partial',
  trip_miles:    'trip_miles',
  miles:         'trip_miles',
  trip_mi:       'trip_miles',
  rate:          'rate',
  rate_mile:     'rate_per_mile',
  rate_per_mile: 'rate_per_mile',
  pick_up:       'pickup_date',
  pickup:        'pickup_date',
  pick_up_date:  'pickup_date',
  company:       'company',
  broker:        'company',
  phone:         'phone',
  load_number:   'load_id',
  load_:         'load_id',
  ref:           'load_id',
  dh_o:          'dh_origin',
  dh_origin:     'dh_origin',
  comments:      'comments',
  comment:       'comments',
};

const parseNum = (v) => parseFloat((v || '0').replace(/[$,\s]/g, '')) || 0;

// Map DAT equipment codes → internal trailer type names
const EQUIPMENT_MAP = {
  'v':           'Dry Van',
  'r':           'Refrigerated',
  'f':           'Flatbed',
  'sd':          'Step Deck',
  'lb':          'Lowboy',
  'vb':          'Dry Van',
  'fsd':         'Step Deck',
  'van':         'Dry Van',
  'reefer':      'Refrigerated',
  'flatbed':     'Flatbed',
  'step deck':   'Step Deck',
  'dry van':     'Dry Van',
};

// Parse "Atlanta, GA" or "Atlanta GA" → { city, state }
const parseLocation = (str) => {
  if (!str || !str.trim()) return { city: '', state: '' };
  const s = str.trim();
  // "City, ST" format
  const withComma = s.match(/^(.+?),\s*([A-Z]{2})$/);
  if (withComma) return { city: withComma[1].trim(), state: withComma[2] };
  // "City ST" format (last two uppercase chars are state)
  const withSpace = s.match(/^(.+)\s+([A-Z]{2})$/);
  if (withSpace) return { city: withSpace[1].trim(), state: withSpace[2] };
  return { city: s, state: '' };
};

// Parse simple CSV line respecting quoted fields
const parseCsvLine = (line) => {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
};

export const parseDatCsv = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV appears empty or has no data rows');

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  // Build index map: internalField → column index
  const idx = {};
  headers.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped && !(mapped in idx)) idx[mapped] = i;
  });

  // Require at least origin + destination to proceed
  const hasOrigin = 'origin' in idx || 'origin_city' in idx;
  const hasDest = 'destination' in idx || 'dest_city' in idx;
  if (!hasOrigin || !hasDest) {
    throw new Error(
      'Could not find Origin and Destination columns. Make sure you exported from DAT One with standard column headers.'
    );
  }

  const get = (row, field) => (idx[field] !== undefined ? row[idx[field]] || '' : '');

  const loads = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 2) continue;

    // Parse origin — may be combined "City, ST" or separate city/state columns
    let pickupCity, pickupState;
    if ('origin' in idx) {
      const loc = parseLocation(get(row, 'origin'));
      pickupCity = loc.city;
      pickupState = loc.state;
    } else {
      pickupCity = get(row, 'origin_city');
      pickupState = ''; // no separate state col mapped yet
    }

    // Parse destination
    let deliveryCity, deliveryState;
    if ('destination' in idx) {
      const loc = parseLocation(get(row, 'destination'));
      deliveryCity = loc.city;
      deliveryState = loc.state;
    } else {
      deliveryCity = get(row, 'dest_city');
      deliveryState = '';
    }

    if (!pickupCity && !deliveryCity) continue; // skip blank rows

    const tripMiles = parseNum(get(row, 'trip_miles'));
    const rate = parseNum(get(row, 'rate'));
    const ratePerMile = parseNum(get(row, 'rate_per_mile'));
    const rawEquip = (get(row, 'equipment') || 'V').trim();
    const equipmentType = EQUIPMENT_MAP[rawEquip.toLowerCase()] || 'Dry Van';
    const loadId = get(row, 'load_id') || `dat-import-${i}`;

    loads.push({
      // Identity — algorithm uses load_id for cache keying
      id: loadId,
      load_id: loadId,
      source: 'dat_import',
      status: 'available',

      // Location — no coordinates from DAT CSV
      pickup_city: pickupCity,
      pickup_state: pickupState,
      delivery_city: deliveryCity,
      delivery_state: deliveryState,
      pickup_lat: null,
      pickup_lng: null,
      delivery_lat: null,
      delivery_lng: null,

      // Distance & rate — use field names the algorithm expects
      distance_miles: tripMiles || null,
      total_revenue: rate,
      pay_rate: rate,
      rate_per_mile: ratePerMile || (tripMiles > 0 ? rate / tripMiles : 0),

      // Equipment — normalized to internal names
      equipment_type: equipmentType,
      trailer_length: parseNum(get(row, 'length')) || 53,
      weight_lbs: parseNum(get(row, 'weight')) || 0,

      // Metadata
      company_name: get(row, 'company'),
      ship_date: get(row, 'pickup_date'),
      age: get(row, 'age'),
      full_partial: get(row, 'full_partial'),
      phone: get(row, 'phone'),
    });
  }

  if (loads.length === 0) throw new Error('No valid loads found in CSV. Check the file format.');
  return loads;
};

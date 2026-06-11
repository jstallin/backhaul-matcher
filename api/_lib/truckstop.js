/**
 * Truckstop SOAP load search — shared server-side implementation.
 *
 * Extracted from api/integrations/[provider].js (PR2) so BOTH the user-facing
 * integration endpoint AND the server cron (api/cron/refresh-requests.js) call the
 * exact same Truckstop search code. The endpoint resolves the per-org integration ID
 * from the caller's JWT; the cron resolves it from the request's user_id with the
 * service-role client. Everything below is provider-agnostic of how the integration
 * ID was obtained.
 *
 * Server-only (uses fast-xml-parser + Truckstop WS env credentials). Lives under
 * api/_lib/ — the leading-underscore segment keeps Vercel from treating it as a route.
 */
import { XMLParser } from 'fast-xml-parser';
import { parseOriginCityState } from '../../src/utils/parseOriginCityState.js';

// Set TRUCKSTOP_BASE_URL=https://webservices.truckstop.com in production Vercel env
const TS_BASE_URL = process.env.TRUCKSTOP_BASE_URL || 'https://testws.truckstop.com';
const TS_ENDPOINT = `${TS_BASE_URL}/v13/Searching/LoadSearch.svc`;
const TS_SOAP_ACTION = 'http://webservices.truckstop.com/v12/ILoadSearch/GetMultipleLoadDetailResults';

// App equipment type names → Truckstop codes
export const EQUIP_TO_TS = {
  'Dry Van':             'V',
  'Flatbed':             'F',
  'Refrigerated':        'R',
  'Step Deck':           'SD',
  'Lowboy':              'LB',
  'Removable Gooseneck': 'RGN',
  'Hotshot':             'HS',
  'Power Only':          'PO',
};

// Truckstop codes → app equipment type names
const TS_TO_EQUIP = {
  'V': 'Dry Van', 'VF': 'Dry Van', 'VB': 'Dry Van',
  'F': 'Flatbed', 'FF': 'Flatbed',
  'R': 'Refrigerated', 'RVF': 'Refrigerated', 'RV': 'Refrigerated',
  'SD': 'Step Deck', 'SDF': 'Step Deck',
  'LB': 'Lowboy',
  'RGN': 'Removable Gooseneck',
  'HS': 'Hotshot',
  'PO': 'Power Only',
  'DD': 'Double Drop',
  'TNK': 'Tanker',
  'IM': 'Intermodal',
};

// All major equipment codes sent when no specific type is requested
const ALL_MAJOR_EQUIP = 'V F R SD LB';

// Maps the fleet's selected transport modes (item 007) onto the Truckstop
// LoadSearch <LoadType> enum (Full | Partial | All). The Full/Partial axis is
// the only mode dimension the LoadSearch Criteria exposes — the broader modes
// (Intermodal, Drayage, Parcel, Air, Water, Ocean) have no Criteria field and
// are captured at the fleet level but not sent as a server-side filter.
// No modes selected → 'Full' (preserves the prior hardcoded default).
export function deriveLoadType(modes = []) {
  const set = new Set(modes);
  const wantsFull = set.has('Truck Load');
  const wantsPartial = set.has('Partial');
  if (wantsFull && wantsPartial) return 'All';
  if (wantsPartial && !wantsFull) return 'Partial';
  if (wantsFull && !wantsPartial) return 'Full';
  // Only non-Full/Partial modes (or none): don't restrict on the Full/Partial axis.
  return modes.length ? 'All' : 'Full';
}

// US state adjacency — used to build destination state filter
const STATE_ADJACENCY = {
  AL:['FL','GA','MS','TN'],         AK:[],
  AZ:['CA','CO','NM','NV','UT'],    AR:['LA','MO','MS','OK','TN','TX'],
  CA:['AZ','NV','OR'],              CO:['AZ','KS','NE','NM','OK','UT','WY'],
  CT:['MA','NY','RI'],              DE:['MD','NJ','PA'],
  FL:['AL','GA'],                   GA:['AL','FL','NC','SC','TN'],
  HI:[],                            ID:['MT','NV','OR','UT','WA','WY'],
  IL:['IN','IA','KY','MI','MO','WI'], IN:['IL','KY','MI','OH'],
  IA:['IL','MN','MO','NE','SD','WI'], KS:['CO','MO','NE','OK'],
  KY:['IL','IN','MO','OH','TN','VA','WV'], LA:['AR','MS','TX'],
  ME:['NH'],                        MD:['DE','PA','VA','WV'],
  MA:['CT','NH','NY','RI','VT'],    MI:['IN','OH','WI'],
  MN:['IA','ND','SD','WI'],         MS:['AL','AR','LA','TN'],
  MO:['AR','IL','IA','KS','KY','NE','OK','TN'], MT:['ID','ND','SD','WY'],
  NE:['CO','IA','KS','MO','SD','WY'], NV:['AZ','CA','ID','OR','UT'],
  NH:['MA','ME','VT'],              NJ:['DE','NY','PA'],
  NM:['AZ','CO','OK','TX','UT'],    NY:['CT','MA','NJ','PA','VT'],
  NC:['GA','SC','TN','VA'],         ND:['MN','MT','SD'],
  OH:['IN','KY','MI','PA','WV'],    OK:['AR','CO','KS','MO','NM','TX'],
  OR:['CA','ID','NV','WA'],         PA:['DE','MD','NJ','NY','OH','WV'],
  RI:['CT','MA'],                   SC:['GA','NC'],
  SD:['IA','MN','MT','ND','NE','WY'], TN:['AL','AR','GA','KY','MS','MO','NC','VA'],
  TX:['AR','LA','NM','OK'],         UT:['AZ','CO','ID','NV','NM','WY'],
  VT:['MA','NH','NY'],              VA:['KY','MD','NC','TN','WV'],
  WA:['ID','OR'],                   WV:['KY','MD','OH','PA','VA'],
  WI:['IL','IA','MI','MN'],         WY:['CO','ID','MT','NE','SD','UT'],
};

export function getDestStates(homeState) {
  if (!homeState) return '';
  const st = homeState.toUpperCase();
  return [st, ...(STATE_ADJACENCY[st] || [])].slice(0, 15).join(' ');
}

// #117: PickupDates is an array type, but we used to send a single date — the window
// start clamped to *UTC* today. That starved evening/weekend searches (a Friday-night
// CT search asked for Sunday-pickup loads only). Build the full remaining window:
// max(start, today) → min(end, start + MAX_PICKUP_DATES − 1), with "today" computed
// in Central time so an evening search doesn't roll onto the next calendar day.
// Truckstop still rejects past dates, so the clamp-up-to-today behavior is preserved.
const MAX_PICKUP_DATES = 10;
export function buildPickupDates(pickupDate, pickupDateEnd, today = new Date()) {
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const startRaw = pickupDate ? String(pickupDate).slice(0, 10) : '';
  const start = startRaw && startRaw >= todayStr ? startRaw : todayStr;
  const endRaw = pickupDateEnd ? String(pickupDateEnd).slice(0, 10) : '';
  const end = endRaw && endRaw > start ? endRaw : start;
  const dates = [];
  const cursor = new Date(`${start}T12:00:00Z`); // noon UTC sidesteps DST edges
  for (let i = 0; i < MAX_PICKUP_DATES; i++) {
    const d = cursor.toISOString().slice(0, 10);
    if (d > end) break;
    dates.push(d);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function buildSoapEnvelope({ integrationId, username, password, originCity, originState, equipmentType, modes, radiusMiles, pickupDate, pickupDateEnd }) {
  const equip = equipmentType ? (EQUIP_TO_TS[equipmentType] || equipmentType) : ALL_MAJOR_EQUIP;
  const loadType = deriveLoadType(modes);
  const { city: cleanCity, state: cleanState } = parseOriginCityState(originCity, originState);
  const pickupDates = buildPickupDates(pickupDate, pickupDateEnd);

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:v12="http://webservices.truckstop.com/v12"
  xmlns:web="http://schemas.datacontract.org/2004/07/WebServices"
  xmlns:web1="http://schemas.datacontract.org/2004/07/WebServices.Searching"
  xmlns:arr="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
  <soapenv:Header/>
  <soapenv:Body>
    <v12:GetMultipleLoadDetailResults>
      <v12:searchRequest>
        <web:IntegrationId>${integrationId}</web:IntegrationId>
        <web:Password>${escapeXml(password)}</web:Password>
        <web:UserName>${escapeXml(username)}</web:UserName>
        <web1:Criteria>
          <web1:DestinationCountry>usa</web1:DestinationCountry>
          <web1:DestinationLatitude>0</web1:DestinationLatitude>
          <web1:DestinationLongitude>0</web1:DestinationLongitude>
          <web1:DestinationRange>300</web1:DestinationRange>
          <web1:EquipmentType>${equip}</web1:EquipmentType>
          <web1:HoursOld>0</web1:HoursOld>
          <web1:LoadType>${loadType}</web1:LoadType>
          ${cleanCity ? `<web1:OriginCity>${escapeXml(cleanCity)}</web1:OriginCity>` : ''}
          <web1:OriginCountry>usa</web1:OriginCountry>
          <web1:OriginLatitude>0</web1:OriginLatitude>
          <web1:OriginLongitude>0</web1:OriginLongitude>
          <web1:OriginRange>${radiusMiles}</web1:OriginRange>
          ${cleanState ? `<web1:OriginState>${cleanState}</web1:OriginState>` : ''}
          <web1:PageNumber>0</web1:PageNumber>
          <web1:PageSize>200</web1:PageSize>
          <web1:PickupDates>
            ${pickupDates.map(d => `<arr:dateTime>${d}T00:00:00</arr:dateTime>`).join('\n            ')}
          </web1:PickupDates>
          <web1:SortDescending>false</web1:SortDescending>
        </web1:Criteria>
      </v12:searchRequest>
    </v12:GetMultipleLoadDetailResults>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// #66: verify an integration ID actually authenticates with Truckstop (not just that
// it was typed in). Runs a minimal LoadSearch and reuses the same auth-error detection
// as the live path. Returns 'valid' | 'invalid' | 'unverified' (transient/can't-check —
// never tell a user their ID is invalid on a Truckstop outage).
export async function validateTruckstopIntegrationId(integrationId) {
  const username = process.env.TRUCKSTOP_WS_USERNAME;
  const password = process.env.TRUCKSTOP_WS_PASSWORD;
  if (!username || !password) return 'unverified';

  try {
    console.log(`[TS validate] endpoint=${TS_ENDPOINT}`);
    const envelope = buildSoapEnvelope({
      integrationId, username, password,
      originCity: 'Atlanta', originState: 'GA',
      equipmentType: null, modes: [], radiusMiles: 25, pickupDate: '',
    });
    const tsRes = await fetch(TS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', 'Accept': 'text/xml', 'SOAPAction': TS_SOAP_ACTION },
      body: envelope,
    });
    const responseText = await tsRes.text();

    if (!tsRes.ok) {
      if (tsRes.status === 401 || tsRes.status === 403 || responseText.includes('Unauthorized')) {
        console.log(`[TS validate] HTTP ${tsRes.status} → invalid`);
        return 'invalid';
      }
      console.log(`[TS validate] HTTP ${tsRes.status} → unverified`);
      return 'unverified'; // 5xx / other transient — don't claim invalid
    }

    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const parsed = parser.parse(responseText);
    const result = parsed?.Envelope?.Body?.GetMultipleLoadDetailResultsResponse?.GetMultipleLoadDetailResultsResult;
    const errors = result?.Errors;
    if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
      const errMsg = JSON.stringify(errors).toLowerCase();
      if (errMsg.includes('unauthorized') || errMsg.includes('invalid integration') || errMsg.includes('authentication')) {
        console.log('[TS validate] → invalid (auth error)');
        return 'invalid';
      }
      console.log('[TS validate] → valid (non-auth errors)');
      return 'valid';
    }
    console.log('[TS validate] → valid');
    return 'valid';
  } catch (err) {
    console.error('[Truckstop] integration ID validation error:', err.message);
    return 'unverified';
  }
}

export async function fetchTruckstopLoads({ integrationId, username, password, originCity, originState, destState, equipmentType, modes, radiusMiles = 150, pickupDate, pickupDateEnd }) {
  const { city: cleanCity, state: cleanState } = parseOriginCityState(originCity, originState);
  if (!cleanState || /^\d{5}$/.test(cleanCity)) {
    console.warn(`[Truckstop] Skipping search — datum point "${originCity}" has no usable city/state. User should set datum to a city, not a ZIP code.`);
    return [];
  }

  const envelope = buildSoapEnvelope({ integrationId, username, password, originCity, originState, equipmentType, modes, radiusMiles, pickupDate, pickupDateEnd });
  // #123: do NOT log the envelope — it carries the per-org IntegrationId and the WS
  // UserName in plaintext (only Password was redacted), which leaked them into Vercel
  // runtime logs on every search. The HTTP request line + load count below are enough
  // to debug; the integration ID stays out of logs (Vault-protected at rest).

  const tsRes = await fetch(TS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'Accept': 'text/xml', 'SOAPAction': TS_SOAP_ACTION },
    body: envelope,
  });

  console.log(`Truckstop SOAP response: HTTP ${tsRes.status}`);
  const responseText = await tsRes.text();

  if (!tsRes.ok) {
    console.error('Truckstop SOAP error:', tsRes.status, responseText);
    if (tsRes.status === 401 || tsRes.status === 403 || responseText.includes('Unauthorized')) {
      const err = new Error('Unauthorized'); err.code = 'UNAUTHORIZED'; throw err;
    }
    throw new Error(`Truckstop API returned ${tsRes.status}`);
  }

  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(responseText);
  const result = parsed?.Envelope?.Body?.GetMultipleLoadDetailResultsResponse?.GetMultipleLoadDetailResultsResult;

  const errors = result?.Errors;
  if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
    console.error('[Truckstop] API errors in response:', JSON.stringify(errors));
    const errMsg = JSON.stringify(errors).toLowerCase();
    if (errMsg.includes('unauthorized') || errMsg.includes('invalid integration') || errMsg.includes('authentication')) {
      const err = new Error('Truckstop API returned errors'); err.code = 'UNAUTHORIZED'; throw err;
    }
    // Non-auth errors (e.g. no results, search warnings) — log and return empty
    return [];
  }

  const rawLoads = toArray(result?.DetailResults?.MultipleLoadDetailResult);

  const seen = new Set();
  const deduped = rawLoads.filter(l => {
    const id = l?.ID;
    if (!id || seen.has(id)) return false;
    seen.add(id); return true;
  });

  const loads = deduped.map(normalizeTsLoad).filter(Boolean);
  console.log(`[Truckstop] ${loads.length} loads (${rawLoads.length} raw, ${rawLoads.length - deduped.length} dupes removed)`);
  return loads;
}

// Ensure a value is always an array (SOAP returns a single object when there's 1 result)
function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Parse Truckstop date format "11/11/24" → "2024-11-11"
function parseTsDate(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 3) return str;
  const [m, d, y] = parts;
  const year = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function normalizeTsLoad(load) {
  if (!load) return null;
  try {
    const originCity  = load.OriginCity  ?? '';
    const originState = load.OriginState ?? '';
    if (!originCity && !originState) return null;

    // MultipleLoadDetailResult uses PaymentAmount + Mileage (vs Payment + Miles in search results)
    const equipCode = load.Equipment ?? load.EquipmentTypes?.Code ?? '';
    const payment   = parseFloat(String(load.PaymentAmount ?? load.Payment ?? '0').replace(/[^0-9.]/g, '')) || 0;
    const miles     = parseInt(load.Mileage ?? load.Miles ?? 0, 10);
    const rpm       = miles > 0 ? Math.round((payment / miles) * 100) / 100 : 0;

    const fuelCostRaw = String(load.FuelCost ?? '');
    const fuelCost    = parseFloat(fuelCostRaw.replace(/[^0-9.]/g, '')) || null;

    const ageRaw   = String(load.Age ?? '0').replace('+', '').trim();
    const ageHours = parseInt(ageRaw, 10) || 0;

    return {
      load_id:          String(load.ID),
      source:           'truckstop',
      broker:           load.TruckCompanyName ?? load.CompanyName ?? 'Truckstop',
      contact_name:     load.PointOfContact ?? null,
      contact_phone:    load.PointOfContactPhone ?? null,
      company_phone:    load.TruckCompanyPhone ?? null,
      company_email:    load.TruckCompanyEmail ?? null,
      mc_number:        load.MCNumber || null,
      freight_type:     'General',
      equipment_type:   TS_TO_EQUIP[equipCode] ?? equipCode,
      equipment_code:   equipCode,
      load_type:        load.LoadType ?? null,
      pickup_city:      originCity,
      pickup_state:     originState,
      pickup_zip:       load.OriginZip || null,
      pickup_lat:       null,
      pickup_lng:       null,
      pickup_date:      parseTsDate(load.PickupDate ?? load.PickUpDate),
      pickup_time:      load.PickupTime ?? null,
      delivery_city:    load.DestinationCity  ?? '',
      delivery_state:   load.DestinationState ?? '',
      delivery_zip:     load.DestinationZip || null,
      delivery_lat:     null,
      delivery_lng:     null,
      delivery_date:    parseTsDate(load.DeliveryDate),
      delivery_time:    load.DeliveryTime ?? null,
      distance_miles:   miles,
      weight_lbs:       parseInt(load.Weight ?? 0, 10),
      trailer_length:   parseFloat(load.Length ?? 53),
      total_revenue:    payment,
      revenue_per_mile: rpm,
      phone:            load.PointOfContactPhone ?? load.TruckCompanyPhone ?? null,
      age_hours:        ageHours,
      fuel_cost:        fuelCost,
      special_info:     load.SpecInfo || null,
      credit:           load.Credit || null,
      experience_factor: load.ExperienceFactor ?? null,
      status:           'available',
      posted_date:      load.Entered ? new Date(load.Entered).toISOString() : new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Failed to normalize Truckstop load:', err);
    return null;
  }
}

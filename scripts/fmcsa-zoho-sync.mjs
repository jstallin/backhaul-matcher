/**
 * FMCSA → Zoho CRM Lead Sync
 *
 * Queries the FMCSA Company Census via the Socrata API (data.transportation.gov),
 * filters for Haul Monitor's ICP (for-hire carriers, 3–75 power units), and
 * upserts matching carriers as Leads in Zoho CRM.
 *
 * ── One-time Zoho setup ───────────────────────────────────────────────────────
 *  1. Go to https://api-console.zoho.com/ → Add Client → Self Client
 *  2. Copy your Client ID and Client Secret
 *  3. Click "Generate Code", scope: ZohoCRM.modules.leads.ALL  (10-min window)
 *  4. Exchange code for tokens (run once in terminal):
 *       curl -X POST "https://accounts.zoho.com/oauth/v2/token?client_id=ID&client_secret=SECRET&code=CODE&grant_type=authorization_code"
 *  5. Save the refresh_token → ZOHO_REFRESH_TOKEN secret
 *  6. In Zoho CRM → Settings → Modules → Leads → Fields, add custom fields:
 *       DOT_Number   (Single Line, unique) ← used for deduplication
 *       MC_Number    (Single Line)
 *       Power_Units  (Number)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Required env vars:
 *   ZOHO_CLIENT_ID      Zoho Self-Client credential
 *   ZOHO_CLIENT_SECRET  Zoho Self-Client credential
 *   ZOHO_REFRESH_TOKEN  Long-lived token from step 4 above
 *
 * Optional env vars:
 *   DRY_RUN=true        Filter and print records without pushing to Zoho
 *   MIN_UNITS=3         Min power units (default: 3)
 *   MAX_UNITS=75        Max power units (default: 75)
 *   SOCRATA_APP_TOKEN   Free token from data.transportation.gov — increases
 *                       rate limits (register at data.transportation.gov/signup)
 */

import https from 'https';

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN           = process.env.DRY_RUN === 'true';
const MIN_UNITS         = parseInt(process.env.MIN_UNITS || '10', 10);
const MAX_UNITS         = parseInt(process.env.MAX_UNITS || '75', 10);
const SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN || null;
// Optional: comma-separated state abbreviations, e.g. "TX,TN,GA,AL,FL"
// Leave blank for nationwide
const STATES = process.env.STATES ? process.env.STATES.split(',').map(s => s.trim().toUpperCase()) : [];

const DATASET_ID      = 'az4n-8mr2';
const SOCRATA_BASE    = `https://data.transportation.gov/resource/${DATASET_ID}.json`;
const PAGE_SIZE       = 50000;

const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

const ZOHO_BATCH_SIZE  = 100;
const ZOHO_RATE_MS     = 400; // ~150 req/min, safely under Zoho's 200/min limit

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[fmcsa-zoho] ${msg}`); }
function fail(msg) { console.error(`[fmcsa-zoho] ERROR: ${msg}`); process.exit(1); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'Accept': 'application/json', ...headers } };
    https.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function post(url, token, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Column discovery ──────────────────────────────────────────────────────────

// Aliases for each logical field — tries each name in order, uses first match
const COLUMN_ALIASES = {
  dotNumber:         ['dot_number', 'usdot_number', 'dot_nbr', 'usdot'],
  legalName:         ['legal_name', 'legal_nm', 'name'],
  dbaName:           ['dba_name', 'dba_nm', 'dba'],
  phone:             ['phone', 'telephone', 'phone_number', 'ph_number'],
  email:             ['email_address', 'email', 'email_addr'],
  street:            ['phy_street', 'physical_street', 'street'],
  city:              ['phy_city', 'physical_city', 'city'],
  state:             ['phy_state', 'physical_state', 'state'],
  zip:               ['phy_zip', 'physical_zip', 'zip'],
  powerUnits:        ['power_units', 'power_unit', 'nbr_power_unit', 'tot_pwr'],
  statusCode:        ['status_code', 'record_status', 'status'],
  carrierOperation:  ['carrier_operation', 'carrier_op', 'operation_type'],
  carship:           ['carship', 'car_ship', 'carrier_type'],
};

async function discoverColumns() {
  const headers = SOCRATA_APP_TOKEN ? { 'X-App-Token': SOCRATA_APP_TOKEN } : {};
  const url = `${SOCRATA_BASE}?$limit=1`;
  const res = await get(url, headers);
  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) {
    fail(`Could not fetch sample row for column discovery: ${JSON.stringify(res.body).slice(0, 200)}`);
  }

  const available = Object.keys(res.body[0]);
  log(`Dataset columns: ${available.join(', ')}`);

  const colMap = {};
  const missing = [];
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = aliases.find(a => available.includes(a));
    if (match) colMap[field] = match;
    else missing.push(field);
  }

  if (missing.length) {
    log(`WARNING: Could not map fields: ${missing.join(', ')} — those fields will be blank`);
  }

  log(`Column mapping: ${Object.entries(colMap).map(([k, v]) => `${k}→${v}`).join(', ')}`);
  return colMap;
}

// ── FMCSA fetch ───────────────────────────────────────────────────────────────

async function fetchFmcsaCarriers(colMap) {
  const headers = SOCRATA_APP_TOKEN ? { 'X-App-Token': SOCRATA_APP_TOKEN } : {};

  const powerCol  = colMap.powerUnits;
  const statusCol = colMap.statusCode;
  const carshipCol = colMap.carship;

  if (!powerCol) {
    fail(`Cannot filter: power_units column not found. Check column mapping above.`);
  }

  // SoQL filter: fleet size + active status + for-hire carrier type
  // carrier_operation='A' = interstate (these are the load-board users)
  // carship='C' = carrier (not pure shippers)
  const carrierOpCol = colMap.carrierOperation;

  const whereParts = [
    `${powerCol}::number between ${MIN_UNITS} and ${MAX_UNITS}`,
  ];
  if (statusCol)     whereParts.push(`${statusCol} = 'A'`);
  if (carrierOpCol)  whereParts.push(`${carrierOpCol} = 'A'`); // interstate commercial only
  if (STATES.length && colMap.state) {
    const stateList = STATES.map(s => `'${s}'`).join(',');
    whereParts.push(`${colMap.state} in(${stateList})`);
  }
  const where = whereParts.join(' AND ');

  // Select only columns we have mappings for
  const select = Object.values(colMap).join(',');

  const carriers = [];
  let offset = 0;
  let page = 1;

  log(`Querying FMCSA dataset (ICP filter: ${MIN_UNITS}–${MAX_UNITS} power units, for-hire)...`);

  while (true) {
    const params = new URLSearchParams({ '$where': where, '$select': select, '$limit': PAGE_SIZE, '$offset': offset });
    const url = `${SOCRATA_BASE}?${params}`;

    process.stdout.write(`\r  Fetching page ${page} (offset ${offset.toLocaleString()})...`);
    const res = await get(url, headers);

    if (res.status !== 200) {
      process.stdout.write('\n');
      fail(`Socrata API error ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
    }

    const rows = res.body;
    if (!Array.isArray(rows) || rows.length === 0) break;

    // Normalize: remap actual column names back to logical names for consistent downstream use
    carriers.push(...rows.map(row => {
      const out = {};
      for (const [field, col] of Object.entries(colMap)) out[field] = row[col] || '';
      return out;
    }));

    if (rows.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    page++;
    await sleep(200);
  }

  process.stdout.write('\n');
  return carriers;
}

// ── Map to Zoho Lead ──────────────────────────────────────────────────────────
// Carrier records are normalized to logical field names by fetchFmcsaCarriers()

function toZohoLead(c) {
  const company = c.dbaName || c.legalName || 'Unknown';
  const phone   = (c.phone || '').replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1');

  return {
    Last_Name:   company,
    Company:     c.legalName || company,
    Phone:       phone       || undefined,
    Email:       c.email?.toLowerCase() || undefined,
    Street:      c.street    || undefined,
    City:        c.city      || undefined,
    State:       c.state     || undefined,
    Zip_Code:    c.zip       || undefined,
    Lead_Source: 'FMCSA Census',
    Description: `Fleet size: ${c.powerUnits} power units`,
    DOT_Number:  c.dotNumber  || undefined,
    Power_Units: c.powerUnits ? parseInt(c.powerUnits, 10) : undefined,
  };
}

// ── Zoho auth ─────────────────────────────────────────────────────────────────

async function getZohoToken() {
  const data = await httpPost('https://accounts.zoho.com/oauth/v2/token', {
    client_id:     ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  });
  if (!data.access_token) fail(`Zoho token error: ${JSON.stringify(data)}`);
  log('Zoho authenticated');
  return data.access_token;
}

// ── Zoho push ─────────────────────────────────────────────────────────────────

async function pushToZoho(carriers, token) {
  let created = 0, updated = 0, errors = 0;
  const batches = Math.ceil(carriers.length / ZOHO_BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const batch = carriers.slice(i * ZOHO_BATCH_SIZE, (i + 1) * ZOHO_BATCH_SIZE);
    const res = await post('https://www.zohoapis.com/crm/v2/Leads/upsert', token, {
      data: batch.map(toZohoLead),
      duplicate_check_fields: ['DOT_Number'],
    });

    if (res.status === 200 || res.status === 201) {
      (res.body?.data || []).forEach(r => {
        if (r.status === 'success' && r.action === 'insert') created++;
        else if (r.status === 'success' && r.action === 'update') updated++;
        else errors++;
      });
    } else {
      log(`Batch ${i + 1}/${batches} failed: HTTP ${res.status}`);
      errors += batch.length;
    }

    const pct = Math.round(((i + 1) / batches) * 100);
    process.stdout.write(`\r  Zoho: ${i + 1}/${batches} batches (${pct}%) — ${created} new, ${updated} updated, ${errors} errors`);

    if (i < batches - 1) await sleep(ZOHO_RATE_MS);
  }

  process.stdout.write('\n');
  return { created, updated, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`FMCSA → Zoho CRM sync${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const geoScope = STATES.length ? STATES.join(', ') : 'nationwide';
  log(`ICP: ${MIN_UNITS}–${MAX_UNITS} power units | interstate for-hire (op=A) | ${geoScope}`);

  if (!DRY_RUN && (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN)) {
    fail('Missing Zoho credentials. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN.\nRun with DRY_RUN=true to test without Zoho.');
  }

  // 1. Discover actual column names from dataset
  const colMap = await discoverColumns();

  // 2. Fetch from FMCSA with discovered column names
  const carriers = await fetchFmcsaCarriers(colMap);
  log(`Fetched ${carriers.length.toLocaleString()} matching carriers from FMCSA`);

  if (carriers.length === 0) fail('No carriers returned. Check filter or dataset column names.');

  if (DRY_RUN) {
    log('Sample (first 5 records):');
    carriers.slice(0, 5).forEach((c, i) =>
      log(`  ${i + 1}. ${c.legalName || c.dbaName} | DOT: ${c.dotNumber} | ${c.powerUnits} units | status: ${c.statusCode} | op: ${c.carrierOperation} | carship: ${c.carship} | ${c.city}, ${c.state}`)
    );
    log(`DRY RUN complete — ${carriers.length.toLocaleString()} records would be pushed to Zoho.`);
    return;
  }

  // 2. Authenticate Zoho
  const token = await getZohoToken();

  // 3. Push
  log(`Pushing ${carriers.length.toLocaleString()} leads to Zoho (${ZOHO_BATCH_SIZE}/batch)...`);
  const { created, updated, errors } = await pushToZoho(carriers, token);

  log('── Summary ───────────────────────────────────────');
  log(`  FMCSA matches:  ${carriers.length.toLocaleString()}`);
  log(`  Created:        ${created.toLocaleString()}`);
  log(`  Updated:        ${updated.toLocaleString()}`);
  log(`  Errors:         ${errors.toLocaleString()}`);
  log('──────────────────────────────────────────────────');
}

main().catch(e => fail(e.message));

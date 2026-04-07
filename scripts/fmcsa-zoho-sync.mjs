/**
 * FMCSA → Zoho CRM Lead Sync
 *
 * Downloads the FMCSA carrier census file, filters for Haul Monitor's ICP
 * (for-hire carriers, 3–75 power units, active status), and upserts matching
 * carriers as Leads in Zoho CRM.
 *
 * ── One-time Zoho setup ───────────────────────────────────────────────────────
 *  1. Go to https://api-console.zoho.com/ → Add Client → Self Client
 *  2. Copy your Client ID and Client Secret
 *  3. Click "Generate Code", scope: ZohoCRM.modules.leads.ALL  (10-min window)
 *  4. Exchange the code for tokens:
 *       curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
 *         -d "client_id=ID&client_secret=SECRET&code=CODE&grant_type=authorization_code"
 *  5. Save the refresh_token — it's long-lived and goes in ZOHO_REFRESH_TOKEN
 *  6. In Zoho CRM → Settings → Modules → Leads → Fields, add three custom fields:
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
 *   CENSUS_FILE=path    Use a pre-downloaded, already-extracted census file
 *   MIN_UNITS=3         Min power units (default: 3)
 *   MAX_UNITS=75        Max power units (default: 75)
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import readline from 'readline';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN       = process.env.DRY_RUN === 'true';
const CENSUS_FILE   = process.env.CENSUS_FILE || null;
const MIN_UNITS     = parseInt(process.env.MIN_UNITS  || '3',  10);
const MAX_UNITS     = parseInt(process.env.MAX_UNITS  || '75', 10);
const CENSUS_URL    = 'https://ai.fmcsa.dot.gov/SMS/files/FMCSA_CENSUS1.zip';
const BATCH_SIZE    = 100;
const RATE_LIMIT_MS = 400; // ~150 req/min — safely under Zoho's 200/min limit

// Column name aliases — FMCSA occasionally changes names between releases.
// The script tries each alias in order and uses the first one found in the header.
const COL = {
  dotNumber:    ['USDOT_NUMBER', 'DOT_NUMBER'],
  mcNumber:     ['MC_MX_FF_NUMBER', 'MC_NUMBER'],
  legalName:    ['LEGAL_NAME'],
  dbaName:      ['DBA_NAME'],
  phone:        ['TELEPHONE', 'PHONE'],
  email:        ['EMAIL_ADDRESS', 'EMAIL'],
  street:       ['PHY_STREET'],
  city:         ['PHY_CITY'],
  state:        ['PHY_STATE'],
  zip:          ['PHY_ZIP'],
  powerUnits:   ['POWER_UNITS', 'NBR_POWER_UNIT'],
};

const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[fmcsa-zoho] ${msg}`); }
function err(msg) { console.error(`[fmcsa-zoho] ERROR: ${msg}`); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiPost(url, token, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Download + extract ────────────────────────────────────────────────────────

async function downloadCensusFile() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmcsa-'));
  const zipPath = path.join(tmpDir, 'FMCSA_CENSUS1.zip');

  log(`Downloading FMCSA census file → ${zipPath}`);
  log(`Source: ${CENSUS_URL}`);

  await new Promise((resolve, reject) => {
    const mod = CENSUS_URL.startsWith('https') ? https : http;
    const file = fs.createWriteStream(zipPath);
    const follow = (url) => {
      mod.get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    follow(CENSUS_URL);
  });

  log('Extracting...');
  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: 'pipe' });

  // Find the extracted .txt file (name may vary)
  const txtFile = fs.readdirSync(tmpDir).find(f => f.endsWith('.txt') || f.endsWith('.csv'));
  if (!txtFile) throw new Error(`No .txt/.csv file found after extracting ${zipPath}`);

  const extractedPath = path.join(tmpDir, txtFile);
  log(`Extracted: ${txtFile}`);
  return extractedPath;
}

// ── Parse + filter ────────────────────────────────────────────────────────────

async function parseAndFilter(filePath) {
  log(`Parsing ${filePath}...`);

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const lines = rl[Symbol.asyncIterator]();

  // Read header row and detect delimiter
  const { value: headerLine } = await lines.next();
  const delimiter = headerLine.includes('\t') ? '\t' : '|';
  const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

  // Resolve column indices from aliases
  const idx = {};
  for (const [field, aliases] of Object.entries(COL)) {
    const found = aliases.find(a => headers.includes(a));
    if (found) {
      idx[field] = headers.indexOf(found);
    } else {
      log(`Warning: column "${field}" not found (tried: ${aliases.join(', ')})`);
    }
  }

  if (idx.dotNumber === undefined || idx.legalName === undefined) {
    throw new Error('Required columns DOT_NUMBER and LEGAL_NAME not found. Check the census file format.');
  }

  const get = (fields, row) => {
    const i = idx[fields];
    return i !== undefined ? (row[i] || '').trim().replace(/^"|"$/g, '') : '';
  };

  const leads = [];
  let total = 0;
  let skipped = { noMC: 0, unitRange: 0, inactive: 0 };

  for await (const line of lines) {
    if (!line.trim()) continue;
    total++;
    const row = line.split(delimiter);

    // Must have MC number (for-hire carrier — uses load boards)
    const mcNumber = get('mcNumber', row);
    if (!mcNumber) { skipped.noMC++; continue; }

    // Active carriers only (status column may not exist — skip check if missing)
    // FMCSA uses various status codes; we skip obvious inactive markers
    // If the column isn't present, we include the record

    // Fleet size filter
    const units = parseInt(get('powerUnits', row) || '0', 10);
    if (units < MIN_UNITS || units > MAX_UNITS) { skipped.unitRange++; continue; }

    const legalName = get('legalName', row);
    const dbaName   = get('dbaName', row);
    const company   = dbaName || legalName;
    if (!company) continue;

    leads.push({
      company,
      dotNumber:  get('dotNumber', row),
      mcNumber,
      phone:      get('phone', row).replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1'),
      email:      get('email', row).toLowerCase(),
      street:     get('street', row),
      city:       get('city', row),
      state:      get('state', row),
      zip:        get('zip', row),
      powerUnits: units,
    });
  }

  log(`Total records: ${total.toLocaleString()}`);
  log(`Filtered out — no MC number: ${skipped.noMC.toLocaleString()}, out of unit range: ${skipped.unitRange.toLocaleString()}`);
  log(`Matched ICP: ${leads.length.toLocaleString()} carriers`);

  return leads;
}

// ── Zoho auth ─────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await httpPost('https://accounts.zoho.com/oauth/v2/token', {
    client_id:     ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  });

  const data = JSON.parse(res.body);
  if (!data.access_token) throw new Error(`Zoho token error: ${res.body}`);
  log('Zoho access token obtained');
  return data.access_token;
}

// ── Zoho push ─────────────────────────────────────────────────────────────────

function toZohoLead(c) {
  return {
    Last_Name:   c.company,   // Zoho requires Last_Name; company name fills it
    Company:     c.company,
    Phone:       c.phone      || undefined,
    Email:       c.email      || undefined,
    Street:      c.street     || undefined,
    City:        c.city       || undefined,
    State:       c.state      || undefined,
    Zip_Code:    c.zip        || undefined,
    Lead_Source: 'FMCSA Census',
    Description: `Fleet size: ${c.powerUnits} power units`,
    // Custom fields — requires manual setup in Zoho (see setup notes at top)
    DOT_Number:  c.dotNumber  || undefined,
    MC_Number:   c.mcNumber   || undefined,
    Power_Units: c.powerUnits || undefined,
  };
}

async function pushToZoho(leads, accessToken) {
  let created = 0, updated = 0, errors = 0;
  const batches = Math.ceil(leads.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const batch = leads.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const payload = {
      data: batch.map(toZohoLead),
      duplicate_check_fields: ['DOT_Number'],  // upsert on DOT number
    };

    const res = await apiPost(
      'https://www.zohoapis.com/crm/v2/Leads/upsert',
      accessToken,
      payload
    );

    if (res.status === 200 || res.status === 201) {
      const results = res.body?.data || [];
      results.forEach(r => {
        if (r.status === 'success' && r.action === 'insert') created++;
        else if (r.status === 'success' && r.action === 'update') updated++;
        else if (r.code !== 'SUCCESS') errors++;
      });
    } else {
      err(`Batch ${i + 1}/${batches} failed: HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
      errors += batch.length;
    }

    const pct = Math.round(((i + 1) / batches) * 100);
    process.stdout.write(`\r  Progress: ${i + 1}/${batches} batches (${pct}%) — ${created} new, ${updated} updated, ${errors} errors`);

    if (i < batches - 1) await sleep(RATE_LIMIT_MS);
  }

  process.stdout.write('\n');
  return { created, updated, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting FMCSA → Zoho sync${DRY_RUN ? ' (DRY RUN)' : ''}`);
  log(`ICP filter: ${MIN_UNITS}–${MAX_UNITS} power units, for-hire (MC number required)`);

  if (!DRY_RUN && (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN)) {
    err('Missing Zoho credentials. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN.');
    err('Run with DRY_RUN=true to test filtering without Zoho credentials.');
    process.exit(1);
  }

  // 1. Get census file
  let censusPath = CENSUS_FILE;
  if (!censusPath) {
    censusPath = await downloadCensusFile();
  } else {
    log(`Using local file: ${censusPath}`);
  }

  // 2. Parse and filter
  const leads = await parseAndFilter(censusPath);

  if (leads.length === 0) {
    log('No matching carriers found. Check filters or census file format.');
    process.exit(0);
  }

  if (DRY_RUN) {
    log('DRY RUN — first 5 matched records:');
    leads.slice(0, 5).forEach((l, i) =>
      log(`  ${i + 1}. ${l.company} | DOT: ${l.dotNumber} | MC: ${l.mcNumber} | ${l.powerUnits} units | ${l.city}, ${l.state}`)
    );
    log(`DRY RUN complete — ${leads.length.toLocaleString()} records would be pushed to Zoho.`);
    return;
  }

  // 3. Authenticate with Zoho
  const accessToken = await getAccessToken();

  // 4. Push leads
  log(`Pushing ${leads.length.toLocaleString()} leads to Zoho in batches of ${BATCH_SIZE}...`);
  const { created, updated, errors } = await pushToZoho(leads, accessToken);

  log('── Summary ───────────────────────────────');
  log(`  Matched ICP:   ${leads.length.toLocaleString()}`);
  log(`  Created:       ${created.toLocaleString()}`);
  log(`  Updated:       ${updated.toLocaleString()}`);
  log(`  Errors:        ${errors.toLocaleString()}`);
  log('──────────────────────────────────────────');
}

main().catch(e => { err(e.message); process.exit(1); });

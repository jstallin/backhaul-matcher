/**
 * Fetches DirectFreight loads for one state group.
 *
 * Required env vars:
 *   STATES       - comma-separated state codes, e.g. "GA,FL,AL,MS,SC"
 *   DF_EMAIL     - DirectFreight login email
 *   DF_PASSWORD  - DirectFreight login password
 *   OUTPUT       - output filename (default: df-loads-<states>.json)
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const STATES = process.env.STATES;
const DF_EMAIL = process.env.DF_EMAIL;
const DF_PASSWORD = process.env.DF_PASSWORD;
const OUTPUT = process.env.OUTPUT || `df-loads-${STATES.replace(/,/g, '_')}.json`;

if (!STATES || !DF_EMAIL || !DF_PASSWORD) {
  console.error('Missing required env vars: STATES, DF_EMAIL, DF_PASSWORD');
  process.exit(1);
}

// reCAPTCHA site key from DirectFreight's page
const SITE_KEY = '6LcuTEsaAAAAAG0R486Jz2_o05TNIiuW8lbz9GtY';

const equipMap = {
  // Dry Van
  V:              'Dry Van',
  VV:             'Dry Van',
  VA:             'Dry Van',
  VAN:            'Dry Van',
  VINT:           'Dry Van',
  'V+A':          'Dry Van',
  'V+V':          'Dry Van',
  'VAN--48FT':    'Dry Van',
  'VAN OR REFRIGERATED': 'Dry Van',
  // Cargo/Curtain
  CRG:            'Cargo Van',
  CV:             'Curtain Van',
  // Flatbed
  F:              'Flatbed',
  FS:             'Flatbed',
  FT:             'Flatbed',
  'F+T':          'Flatbed',
  'F+S':          'Flatbed',
  MX:             'Flatbed',
  FINT:           'Flatbed',
  FLCS:           'Flatbed',
  FLATBED:        'Flatbed',
  '48FT':         'Flatbed',
  CONESTOGA:      'Flatbed',
  // Refrigerated
  R:              'Refrigerated',
  RINT:           'Refrigerated',
  FOOD_GRADE:     'Refrigerated',
  // Step Deck / Drop
  SD:             'Step Deck',
  DD:             'Step Deck',
  DD_DECK:        'Step Deck',
  // Lowboy
  LB:             'Lowboy',
  RGN:            'Lowboy',
  // Specialty
  HS:             'Hotshot',
  BT:             'Box Truck',
  STRAIGHT:       'Box Truck',
  TNK:            'Tanker',
  PNEU:           'Tanker',
  TANKER_STEEL:   'Tanker',
  CONT:           'Container',
  LA:             'Landall',
  AC:             'Auto Carrier',
  DT:             'Dump Trailer',
  HB:             'Hopper Bottom',
  HOPPERBOTTOM:   'Hopper Bottom',
  '40+BOTTOM':    'Hopper Bottom',
  PO:             'Power Only',
  HAZC:           'Hazmat',
  OTHER:          'Other',
  AIR_RIDE:       'Dry Van',
};

// Default trailer length by equipment code family when the load doesn't specify one.
// Flatbed-family trailers standard at 48ft; vans and reefers standard at 53ft.
const defaultLengthForCode = (code) => {
  const flatbedCodes = new Set(['F', 'FS', 'FT', 'F+T', 'F+S', 'MX', 'FINT', 'FLCS', 'FLATBED', '48FT', 'CONESTOGA', 'SD', 'DD', 'DD_DECK', 'LB', 'RGN']);
  return flatbedCodes.has(String(code).trim()) ? 48 : 53;
};

// Returns an array of normalized records — one per equipment type.
// When DF lists multiple types (e.g. trailer_type: ['F', 'V']), we expand into
// separate records so each can be matched independently against fleet equipment.
// Single-type loads produce one record with the original entry_id (no suffix).
const normalize = (r) => {
  const rawTypes = Array.isArray(r.trailer_type)
    ? r.trailer_type
    : [r.trailer_type || 'V'];

  const multi = rawTypes.length > 1;

  return rawTypes.map((rawCode) => {
    const trailerCode = String(rawCode).trim();
    // Suffix load_id only when multiple types — keeps single-type IDs unchanged.
    const loadId = multi ? `${r.entry_id}-${trailerCode.toLowerCase()}` : r.entry_id;
    // Use the reported length when available; fall back to a type-specific default.
    const trailerLength = r.length || defaultLengthForCode(trailerCode);
    return {
      load_id:        loadId,
      source:         'directfreight',
      status:         'available',
      equipment_type: equipMap[trailerCode] || trailerCode,
      pickup_city:    r.origin_city || '',
      pickup_state:   r.origin_state || '',
      pickup_lat:     null,
      pickup_lng:     null,
      delivery_city:  r.destination_city || '',
      delivery_state: r.destination_state || '',
      delivery_lat:   null,
      delivery_lng:   null,
      distance_miles: r.trip_miles || null,
      total_revenue:  r.pay_rate || 0,
      pay_rate:       r.pay_rate || 0,
      rate_per_mile:  r.rate_per_mile_est || 0,
      weight_lbs:     r.weight || 0,
      trailer_length: trailerLength,
      ship_date:      r.ship_date || null,
      company_name:   r.company_name !== 'View Details' ? r.company_name : '',
      phone:          r.phone_number !== 'View Details' ? r.phone_number : '',
      full_load:      r.full_load,
      age_minutes:    r.age || 0,
    };
  });
};

const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
});

const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
});

// Hide automation signals that trigger bot detection
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
});

const page = await context.newPage();

try {
  // --- Login ---
  console.log(`[${STATES}] Logging in...`);
  await page.goto('https://www.directfreight.com/home/user/email_login', { waitUntil: 'load', timeout: 60000 });
  console.log(`[${STATES}] Landed on: ${page.url()}`);
  await page.waitForSelector('#user', { timeout: 60000 });

  await page.fill('#user', DF_EMAIL);
  await page.fill('#password', DF_PASSWORD);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  if (page.url().includes('login')) {
    throw new Error('Login failed — still on login page. Check DF_EMAIL / DF_PASSWORD secrets.');
  }
  console.log(`[${STATES}] Logged in.`);

  // --- Navigate to loads page ---
  const loadsUrl = `https://www.directfreight.com/home/boards/find/loads/all/${STATES}`;
  console.log(`[${STATES}] Navigating to ${loadsUrl}`);
  await page.goto(loadsUrl, { waitUntil: 'networkidle', timeout: 60000 });
  console.log(`[${STATES}] Loads page landed on: ${page.url()}`);

  // --- Wait for Vue app to populate loads (it fetches async after page render) ---
  console.log(`[${STATES}] Waiting for vueapp.list to populate...`);
  await page.waitForFunction(
    () => {
      try {
        const v = window.vueapp;
        const arr = v && (v.list || v.results || v.RESULTS || v.loads);
        return Array.isArray(arr) && arr.length > 0;
      } catch(e) { return false; }
    },
    { timeout: 60000 }
  );
  console.log(`[${STATES}] vueapp populated.`);

  // --- Extract page 1 data from vueapp ---
  const page1Result = await page.evaluate(() => {
    const v = window.vueapp;
    const arr = v.list || v.results || v.RESULTS || v.loads;
    const arrKey = v.list ? 'list' : v.results ? 'results' : v.RESULTS ? 'RESULTS' : 'loads';
    const totalPages = v.total_pages || v.TOTAL_PAGES || v.totalPages || 1;
    return {
      _arrKey: arrKey,
      RESULTS: arr,
      TOTAL_PAGES: totalPages,
    };
  });
  console.log(`[${STATES}] vueapp.${page1Result._arrKey}: ${page1Result.RESULTS.length} loads, ${page1Result.TOTAL_PAGES} pages`);

  // --- Collect page 1 loads ---
  const TOTAL_PAGES = page1Result.TOTAL_PAGES;
  const allLoads = page1Result.RESULTS.flatMap(normalize);
  console.log(`[${STATES}] Page 1/${TOTAL_PAGES}: ${allLoads.length} loads`);

  // --- Paginate: use Playwright's request context (carries session cookies, no reCAPTCHA needed) ---
  if (TOTAL_PAGES > 1) {
    const stateList = STATES.split(',');
    const baseParams = new URLSearchParams();
    stateList.forEach(s => baseParams.append('origin_state', s));
    stateList.forEach(s => baseParams.append('destination_state', s));
    baseParams.set('origin_radius', '300');
    baseParams.set('destination_radius', '300');
    baseParams.set('sort_parameter', 'age');

    for (let pageNum = 2; pageNum <= TOTAL_PAGES; pageNum++) {
      try {
        // Get a fresh reCAPTCHA token from the loaded page for each request
        const token = await page.evaluate(async (siteKey) => {
          if (typeof grecaptcha === 'undefined') return '';
          try {
            return await grecaptcha.execute(siteKey, { action: 'search' });
          } catch(e) { return ''; }
        }, SITE_KEY);

        const params = new URLSearchParams(baseParams);
        params.set('page_number', String(pageNum));
        params.set('_', String(Date.now()));
        if (token) params.set('google_recaptcha_response', token);

        const response = await context.request.get(
          `https://www.directfreight.com/home/api_search/loads?${params}`,
          { headers: { accept: 'application/json' } }
        );

        if (!response.ok()) {
          console.warn(`[${STATES}] Page ${pageNum} failed: ${response.status()}`);
          continue;
        }

        const data = await response.json();

        // API clamps page_number to its max — detect and stop
        const returnedPage = data.page_number ?? pageNum;
        if (returnedPage < pageNum) {
          console.log(`[${STATES}] API capped at page ${returnedPage} (requested ${pageNum}) — stopping pagination. ${allLoads.length} loads total.`);
          break;
        }

        const pageLoads = (data.list || data.results || data.RESULTS || []).flatMap(normalize);
        allLoads.push(...pageLoads);

        if (pageNum % 10 === 0 || pageNum === TOTAL_PAGES) {
          console.log(`[${STATES}] Page ${pageNum}/${TOTAL_PAGES}: ${allLoads.length} loads total`);
        }

        // 1.5s delay — gives reCAPTCHA token service room between calls
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.warn(`[${STATES}] Page ${pageNum} error: ${err.message}`);
      }
    }
  }

  console.log(`[${STATES}] ✅ ${allLoads.length} loads fetched`);
  writeFileSync(OUTPUT, JSON.stringify(allLoads, null, 2));
  console.log(`[${STATES}] 💾 Saved to ${OUTPUT}`);

} catch (err) {
  console.error(`[${STATES}] ❌ Fatal: ${err.message}`);
  process.exit(1);
} finally {
  await browser.close();
}

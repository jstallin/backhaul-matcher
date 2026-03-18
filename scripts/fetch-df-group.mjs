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
  V:    'Dry Van',
  VV:   'Dry Van',
  VINT: 'Dry Van',
  CRG:  'Cargo Van',
  CV:   'Curtain Van',
  F:    'Flatbed',
  FS:   'Flatbed',
  FT:   'Flatbed',
  MX:   'Flatbed',
  FINT: 'Flatbed',
  R:    'Refrigerated',
  RINT: 'Refrigerated',
  SD:   'Step Deck',
  DD:   'Step Deck',
  LB:   'Lowboy',
  RGN:  'Lowboy',
  HS:   'Hotshot',
  BT:   'Box Truck',
  TNK:  'Tanker',
  PNEU: 'Tanker',
  CONT: 'Container',
  LA:   'Landall',
  AC:   'Auto Carrier',
  DT:   'Dump Trailer',
  HB:   'Hopper Bottom',
  PO:   'Power Only',
};

const normalize = (r) => {
  const trailerCode = Array.isArray(r.trailer_type)
    ? r.trailer_type[0]
    : r.trailer_type || 'V';
  return {
    load_id:        r.entry_id,
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
    trailer_length: r.length || 53,
    ship_date:      r.ship_date || null,
    company_name:   r.company_name !== 'View Details' ? r.company_name : '',
    phone:          r.phone_number !== 'View Details' ? r.phone_number : '',
    full_load:      r.full_load,
    age_minutes:    r.age || 0,
  };
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
  const allLoads = page1Result.RESULTS.map(normalize);
  console.log(`[${STATES}] Page 1/${TOTAL_PAGES}: ${allLoads.length} loads`);

  // --- Paginate: make XHR calls from within the browser (reCAPTCHA token available there) ---
  if (TOTAL_PAGES > 1) {
    const stateList = STATES.split(',');
    const additionalLoads = await page.evaluate(async ({ siteKey, stateList, TOTAL_PAGES, equipMap }) => {
      const normalize = (r) => {
        const trailerCode = Array.isArray(r.trailer_type)
          ? r.trailer_type[0]
          : r.trailer_type || 'V';
        return {
          load_id:        r.entry_id,
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
          trailer_length: r.length || 53,
          ship_date:      r.ship_date || null,
          company_name:   r.company_name !== 'View Details' ? r.company_name : '',
          phone:          r.phone_number !== 'View Details' ? r.phone_number : '',
          full_load:      r.full_load,
          age_minutes:    r.age || 0,
        };
      };

      const baseParams = () => {
        const p = new URLSearchParams();
        stateList.forEach(s => p.append('origin_state', s));
        stateList.forEach(s => p.append('destination_state', s));
        p.set('origin_radius', 300);
        p.set('destination_radius', 300);
        p.set('sort_parameter', 'age');
        return p;
      };

      const loads = [];
      for (let pageNum = 2; pageNum <= TOTAL_PAGES; pageNum++) {
        try {
          if (typeof grecaptcha === 'undefined') {
            console.warn(`Page ${pageNum}: grecaptcha unavailable, stopping pagination`);
            break;
          }

          const token = await grecaptcha.execute(siteKey, { action: 'search' });
          const params = baseParams();
          params.set('google_recaptcha_response', token);
          params.set('page_number', pageNum);
          params.set('_', Date.now());

          const res = await fetch(`/home/api_search/loads?${params}`, {
            headers: { accept: 'application/json' },
          });

          if (!res.ok) {
            console.warn(`Page ${pageNum} failed: ${res.status}`);
            continue;
          }

          const data = await res.json();
          const pageLoads = (data.list || data.results || data.RESULTS || []).map(normalize);
          loads.push(...pageLoads);

          if (pageNum % 5 === 0 || pageNum === TOTAL_PAGES) {
            console.log(`Page ${pageNum}/${TOTAL_PAGES}: ${loads.length} additional loads`);
          }

          await new Promise(r => setTimeout(r, 600));
        } catch (err) {
          console.warn(`Page ${pageNum} error: ${err.message}`);
        }
      }
      return loads;
    }, { siteKey: SITE_KEY, stateList, TOTAL_PAGES, equipMap });

    allLoads.push(...additionalLoads);
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

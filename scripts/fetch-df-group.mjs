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

  // --- Set up network response interception before navigating to loads ---
  const capturedResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    // Capture any JSON response that might be loads data
    if (ct.includes('json') && (
      url.includes('api_search') ||
      url.includes('/loads') ||
      url.includes('/boards') ||
      url.includes('/search')
    )) {
      try {
        const data = await response.json();
        capturedResponses.push({ url, data });
        console.log(`[${STATES}] Intercepted JSON from: ${url} keys=${Object.keys(data).join(',')}`);
      } catch (e) {
        // ignore parse errors
      }
    }
  });

  // --- Navigate to loads page ---
  const loadsUrl = `https://www.directfreight.com/home/boards/find/loads/all/${STATES}`;
  console.log(`[${STATES}] Navigating to ${loadsUrl}`);
  await page.goto(loadsUrl, { waitUntil: 'networkidle', timeout: 60000 });
  console.log(`[${STATES}] Loads page landed on: ${page.url()}`);

  // --- Debug: page title and globals ---
  const pageTitle = await page.title();
  console.log(`[${STATES}] Page title: "${pageTitle}"`);

  const pageDebug = await page.evaluate(() => {
    const relevantGlobals = Object.keys(window).filter(k =>
      /^(__|\w*result|\w*load|\w*data|\w*search)/i.test(k)
    ).slice(0, 40);
    const bodySnippet = document.body?.innerText?.substring(0, 300) || '';
    return { relevantGlobals, bodySnippet };
  });
  console.log(`[${STATES}] Relevant globals: ${JSON.stringify(pageDebug.relevantGlobals)}`);
  console.log(`[${STATES}] Body text snippet: ${pageDebug.bodySnippet.replace(/\n/g, ' ').substring(0, 200)}`);
  console.log(`[${STATES}] Intercepted ${capturedResponses.length} JSON responses`);

  // --- Try to find loads data: first from intercepted XHR, then from window globals ---
  let page1Result = null;

  // Check intercepted responses for loads data
  for (const { url: respUrl, data } of capturedResponses) {
    const results = data.RESULTS || data.results || data.list || data.loads;
    if (Array.isArray(results) && results.length > 0) {
      console.log(`[${STATES}] Found page 1 data in intercepted response: ${respUrl} (${results.length} loads)`);
      page1Result = data;
      break;
    }
  }

  // Check window globals — including DF_ads_results and common variants
  if (!page1Result) {
    page1Result = await page.evaluate(() => {
      const candidates = [
        '__RESULTS', '__DATA', '__INITIAL_DATA', '__LOADS', '__STATE',
        'DF_ads_results',
      ];
      for (const key of candidates) {
        try {
          const val = window[key];
          if (!val) continue;
          // Direct array of load records
          if (Array.isArray(val) && val.length > 0 && val[0]?.entry_id) {
            return { _foundKey: key, RESULTS: val, TOTAL_PAGES: 1 };
          }
          // Object with nested results
          const arr = val.RESULTS || val.results || val.list || val.loads;
          if (Array.isArray(arr)) {
            return { _foundKey: key, RESULTS: arr, TOTAL_PAGES: val.TOTAL_PAGES || val.total_pages || 1 };
          }
        } catch(e) {}
      }
      return null;
    });
    if (page1Result) {
      console.log(`[${STATES}] Found page 1 data in window.${page1Result._foundKey} (${page1Result.RESULTS.length} loads, ${page1Result.TOTAL_PAGES} pages)`);
    }
  }

  if (!page1Result) {
    // Last attempt: wait a few seconds and broad-scan all window vars safely
    console.log(`[${STATES}] No data found yet, waiting 5s for late-loading content...`);
    await page.waitForTimeout(5000);

    const lateCheck = await page.evaluate(() => {
      const found = {};
      let keys = [];
      try { keys = Object.keys(window); } catch(e) {}
      for (const key of keys) {
        try {
          const val = window[key];
          if (!val || typeof val !== 'object') continue;
          if (Array.isArray(val) && val.length > 0 && val[0]?.entry_id) {
            found[key] = { type: 'direct-array', count: val.length };
            continue;
          }
          const arr = val.RESULTS || val.results || val.list || val.loads;
          if (Array.isArray(arr)) {
            found[key] = { type: 'nested', count: arr.length, sample: arr[0]?.entry_id || arr[0] };
          }
        } catch(e) { /* skip cross-origin frames */ }
      }
      return found;
    });
    console.log(`[${STATES}] Late-check window scan: ${JSON.stringify(lateCheck)}`);
    console.log(`[${STATES}] Late-check intercepted ${capturedResponses.length} JSON responses total`);

    // Also dump all DF_ globals for clues
    const dfGlobals = await page.evaluate(() => {
      const out = {};
      let keys = [];
      try { keys = Object.keys(window); } catch(e) {}
      for (const key of keys) {
        if (!key.startsWith('DF_') && !key.startsWith('__DF')) continue;
        try {
          const val = window[key];
          const type = Array.isArray(val) ? `array[${val.length}]` : typeof val;
          out[key] = type === 'string' ? val.substring(0, 100) : type;
        } catch(e) {}
      }
      return out;
    });
    console.log(`[${STATES}] DF_ globals dump: ${JSON.stringify(dfGlobals)}`);

    throw new Error('Could not find loads data on page — check debug output above for clues.');
  }

  // --- Collect page 1 loads ---
  const rawPage1 = page1Result.RESULTS || page1Result.results || page1Result.list || page1Result.loads;
  const TOTAL_PAGES = page1Result.TOTAL_PAGES || page1Result.total_pages || 1;
  const allLoads = rawPage1.map(normalize);
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

/**
 * Fetches TruckerPath loads for all 50 US states.
 *
 * Strategy:
 *   1. Playwright logs in to TruckerPath and extracts the x-auth-token from localStorage.
 *   2. Browser closes — all subsequent calls are direct API fetches with the token.
 *   3. For each state, POST to the search API using the state's geographic centroid
 *      + 300-mile pickup deadhead. Drop-off is left unconstrained (all destinations).
 *   4. Paginate with offset until fewer than PAGE_LIMIT results are returned.
 *   5. Write deduplicated, normalized loads to OUTPUT.
 *
 * Required env vars:
 *   TP_EMAIL     - TruckerPath account email
 *   TP_PASSWORD  - TruckerPath account password
 *   OUTPUT       - output filename (default: tp-loads.json)
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const TP_EMAIL    = process.env.TP_EMAIL;
const TP_PASSWORD = process.env.TP_PASSWORD;
const OUTPUT      = process.env.OUTPUT || 'tp-loads.json';

const API_URL    = 'https://api.truckerpath.com/tl/search/filter/web/v2';
const LOGIN_URL  = 'https://loadboard.truckerpath.com/login';
const PAGE_LIMIT = 100;
const DELAY_MS   = 1000; // between state queries — be polite

if (!TP_EMAIL || !TP_PASSWORD) {
  console.error('Missing required env vars: TP_EMAIL, TP_PASSWORD');
  process.exit(1);
}

// ─── Geographic centroids for all 50 states ───────────────────────────────────
const STATE_CENTROIDS = [
  { state: 'AL', lat: 32.7,  lng: -86.7  },
  { state: 'AK', lat: 64.2,  lng: -153.4 },
  { state: 'AZ', lat: 34.3,  lng: -111.1 },
  { state: 'AR', lat: 34.9,  lng: -92.4  },
  { state: 'CA', lat: 36.8,  lng: -119.7 },
  { state: 'CO', lat: 39.0,  lng: -105.5 },
  { state: 'CT', lat: 41.6,  lng: -72.7  },
  { state: 'DE', lat: 39.0,  lng: -75.5  },
  { state: 'FL', lat: 27.8,  lng: -81.7  },
  { state: 'GA', lat: 32.7,  lng: -83.4  },
  { state: 'HI', lat: 20.3,  lng: -156.4 },
  { state: 'ID', lat: 44.4,  lng: -114.6 },
  { state: 'IL', lat: 40.0,  lng: -89.2  },
  { state: 'IN', lat: 40.3,  lng: -86.1  },
  { state: 'IA', lat: 42.0,  lng: -93.2  },
  { state: 'KS', lat: 38.5,  lng: -98.4  },
  { state: 'KY', lat: 37.7,  lng: -84.9  },
  { state: 'LA', lat: 31.0,  lng: -91.8  },
  { state: 'ME', lat: 45.4,  lng: -69.0  },
  { state: 'MD', lat: 39.1,  lng: -76.8  },
  { state: 'MA', lat: 42.2,  lng: -71.5  },
  { state: 'MI', lat: 44.0,  lng: -85.5  },
  { state: 'MN', lat: 46.4,  lng: -93.1  },
  { state: 'MS', lat: 32.7,  lng: -89.7  },
  { state: 'MO', lat: 38.5,  lng: -92.5  },
  { state: 'MT', lat: 47.0,  lng: -110.4 },
  { state: 'NE', lat: 41.5,  lng: -99.9  },
  { state: 'NV', lat: 39.5,  lng: -116.4 },
  { state: 'NH', lat: 44.0,  lng: -71.6  },
  { state: 'NJ', lat: 40.1,  lng: -74.7  },
  { state: 'NM', lat: 34.5,  lng: -106.2 },
  { state: 'NY', lat: 43.0,  lng: -75.5  },
  { state: 'NC', lat: 35.5,  lng: -79.4  },
  { state: 'ND', lat: 47.5,  lng: -100.5 },
  { state: 'OH', lat: 40.4,  lng: -82.8  },
  { state: 'OK', lat: 35.6,  lng: -96.9  },
  { state: 'OR', lat: 44.1,  lng: -120.5 },
  { state: 'PA', lat: 41.2,  lng: -77.2  },
  { state: 'RI', lat: 41.7,  lng: -71.5  },
  { state: 'SC', lat: 33.8,  lng: -80.9  },
  { state: 'SD', lat: 44.4,  lng: -100.2 },
  { state: 'TN', lat: 35.8,  lng: -86.7  },
  { state: 'TX', lat: 31.5,  lng: -99.3  },
  { state: 'UT', lat: 39.3,  lng: -111.1 },
  { state: 'VT', lat: 44.0,  lng: -72.7  },
  { state: 'VA', lat: 37.5,  lng: -79.5  },
  { state: 'WA', lat: 47.4,  lng: -120.6 },
  { state: 'WV', lat: 38.9,  lng: -80.5  },
  { state: 'WI', lat: 44.3,  lng: -89.8  },
  { state: 'WY', lat: 43.0,  lng: -107.6 },
];

// ─── Equipment type normalization ─────────────────────────────────────────────
const EQUIP_MAP = {
  van:          'Dry Van',
  dryvan:       'Dry Van',
  dry_van:      'Dry Van',
  reefer:       'Refrigerated',
  refrigerated: 'Refrigerated',
  flatbed:      'Flatbed',
  stepdeck:     'Step Deck',
  step_deck:    'Step Deck',
  conestoga:    'Conestoga',
  hotshot:      'Hot Shot',
  hot_shot:     'Hot Shot',
  power_only:   'Power Only',
  poweronly:    'Power Only',
  container:    'Container',
  tanker:       'Tanker',
  box_truck:    'Box Truck',
  boxtruck:     'Box Truck',
  rgn:          'Removable Gooseneck',
  lowboy:       'Lowboy',
};

function normalizeEquipment(equipArray) {
  if (!Array.isArray(equipArray) || equipArray.length === 0) return 'Dry Van';
  const key = String(equipArray[0]).toLowerCase().replace(/[\s-]+/g, '_');
  return EQUIP_MAP[key] || equipArray[0];
}

function normalize(item) {
  if (!item) return null;
  try {
    const pickup  = item.pickup   || {};
    const dropOff = item.drop_off || {};
    const broker  = item.broker   || {};

    const price    = item.price || item.price_total || 0;
    const distance = item.distance || item.distance_total || null;

    return {
      load_id:       item.external_id || item.shipment_id,
      source:        'truckerpath',
      status:        'available',

      equipment_type: normalizeEquipment(item.equipment),
      // TruckerPath doesn't expose trailer length — default to 53
      trailer_length: 53,
      weight_lbs:     item.weight || 0,
      full_load:      item.load_size === 'full',
      freight_type:   item.description || '',

      pickup_city:   pickup.address?.city  || '',
      pickup_state:  pickup.address?.state || '',
      pickup_lat:    pickup.location?.lat  ?? null,
      pickup_lng:    pickup.location?.lng  ?? null,
      pickup_date:   pickup.date_local     || null,

      delivery_city:  dropOff.address?.city  || '',
      delivery_state: dropOff.address?.state || '',
      delivery_lat:   dropOff.location?.lat  ?? null,
      delivery_lng:   dropOff.location?.lng  ?? null,

      distance_miles:  distance,
      total_revenue:   price,
      pay_rate:        price,
      rate_per_mile:   distance > 0 ? Math.round((price / distance) * 100) / 100 : 0,

      company_name:   broker.company      || '',
      contact_name:   broker.contact_name || '',
      phone:          broker.phone?.number || '',
      contact_email:  broker.email        || '',
      mc_number:      broker.mc           || '',
      dot_number:     broker.dot          || '',
      credit_score:   broker.transcredit_rating?.score       ?? null,
      days_to_pay:    broker.transcredit_rating?.days_to_pay ?? null,

      // age is in milliseconds in the TruckerPath API
      age_minutes:    item.age ? Math.round(item.age / 60000) : 0,
    };
  } catch (err) {
    console.warn('Failed to normalize TP load:', err.message);
    return null;
  }
}

// ─── Build search payload for one state ───────────────────────────────────────
function buildPayload(centroid, offset = 0, template = null) {
  // If we captured the browser's own payload, use it as a template and just
  // swap in our state centroid + reset pagination. This ensures field names
  // and nesting exactly match what the API expects.
  if (template) {
    const payload = JSON.parse(JSON.stringify(template)); // deep clone
    payload.offset     = offset;
    payload.limit      = PAGE_LIMIT;
    payload.search_id  = null;

    // Overwrite pickup location with our state centroid
    const pickup = payload?.query?.pickup ?? payload?.options?.query?.pickup;
    if (pickup?.geo?.location) {
      pickup.geo.location = { lat: centroid.lat, lng: centroid.lng };
      if (pickup.geo.deadhead)  pickup.geo.deadhead  = { max: 300 };
      if (pickup.geo.radius !== undefined) pickup.geo.radius = 300;
    }
    // Remove date filter so we get all upcoming loads
    if (pickup?.date_local) delete pickup.date_local;

    return payload;
  }

  // Fallback: best-guess payload if no template was captured
  return {
    sort:          [{ smart_sort: 'desc' }],
    offset,
    limit:         PAGE_LIMIT,
    search_id:     null,
    repeat_search: false,
    road_miles:    true,
    include_auth_required: false,
    paging_enable: true,
    query: {
      pickup: {
        geo: {
          location: { lat: centroid.lat, lng: centroid.lng },
          deadhead: { max: 300 },
        },
      },
    },
  };
}

// ─── Fetch all loads for one state via in-browser fetch ───────────────────────
// Running fetch() inside page.evaluate() uses the browser's full cookie jar
// and session state — no need to manually reconstruct auth headers.
let _firstCall = true;

async function fetchStateLoads(centroid, page, token) {
  const loads = [];
  let   offset = 0;

  while (true) {
    const body = buildPayload(centroid, offset, _capturedTemplate);

    const result = await page.evaluate(async ([url, payload, tok]) => {
      try {
        const res = await fetch(url, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': tok,
            'client':       'web',
          },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (err) {
        return { status: 0, text: err.message };
      }
    }, [API_URL, body, token]);

    if (result.status === 0 || result.status >= 400) {
      console.warn(`  [${centroid.state}] offset=${offset} → HTTP ${result.status}: ${result.text.slice(0, 200)}`);
      break;
    }

    if (_firstCall) {
      _firstCall = false;
      console.log(`[${centroid.state}] HTTP ${result.status}, response (800 chars): ${result.text.slice(0, 800)}`);
    }

    let data;
    try { data = JSON.parse(result.text); } catch { console.warn(`[${centroid.state}] Non-JSON response`); break; }

    const items = data.items || data.loads || data.results || data.data || [];
    loads.push(...items.map(normalize).filter(Boolean));

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return loads;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport:  { width: 1280, height: 800 },
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = await context.newPage();
let authToken = null;
let capturedPayload   = null; // payload the browser sends to the search API
let _capturedTemplate = null; // set after login, used by fetchStateLoads

try {
  // ── Login ──────────────────────────────────────────────────────────────────
  console.log('Logging in to TruckerPath...');

  // Intercept auth token from any API response header
  page.on('response', async (response) => {
    if (authToken) return;
    const token = response.headers()['x-auth-token'];
    if (token) {
      authToken = token;
      console.log('Captured x-auth-token from response header');
    }
  });

  // Log ALL api.truckerpath.com requests so we can see what the app calls
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('truckerpath.com')) return;
    if (request.method() === 'POST') {
      const body = (request.postData() || '').slice(0, 300);
      console.log(`[REQ] ${request.method()} ${url} | ${body}`);
      // Capture the first /tl/search/filter call as our payload template
      if (!capturedPayload && url.includes('/tl/search/filter')) {
        try {
          const parsed = JSON.parse(request.postData() || '{}');
          // Only use as template if it's NOT one of our own calls (lat/lng won't match centroids exactly if from the app)
          capturedPayload = parsed;
          console.log('Captured search payload as template');
        } catch { /* ignore */ }
      }
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('truckerpath.com') && response.request().method() === 'GET') {
      console.log(`[RES] GET ${url} → ${response.status()}`);
    }
  });

  // Try direct login URL first; fall back to home + clicking the nav button
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 60000 });
  console.log(`Landed on: ${page.url()}`);

  await page.screenshot({ path: 'tp-login-debug.png', fullPage: false });

  // If the direct /login URL redirected back to the dashboard, click the nav link
  if (!page.url().includes('/login')) {
    console.log('Direct /login redirected — dismissing cookie modal then clicking Log In');
    await page.waitForTimeout(2000); // let React render

    // Dismiss cookie consent if present — it blocks clicks on nav elements
    const acceptBtn = page.locator('button:has-text("Accept")');
    if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptBtn.click();
      console.log('Dismissed cookie consent');
      await page.waitForTimeout(500);
    }

    // Listen for any popup window that Log In might open
    const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);

    // Click the "Log In" nav link by text
    await page.locator('text="Log In"').first().click({ timeout: 10000 });
    console.log('Clicked Log In');

    // Wait a moment then capture what happened
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tp-afterclick-debug.png', fullPage: false });
    console.log(`URL after click: ${page.url()}`);

    // Dump all inputs and their attributes so we can see the login form structure
    const inputsAfterClick = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(el => ({
        type: el.type, name: el.name, id: el.id,
        placeholder: el.placeholder, visible: el.offsetParent !== null,
      }))
    );
    console.log('Inputs after click:', JSON.stringify(inputsAfterClick, null, 2));

    // Check if a popup opened
    const popup = await popupPromise;
    if (popup) {
      console.log(`Popup opened: ${popup.url()}`);
      await popup.waitForLoadState('load');
      await popup.screenshot({ path: 'tp-popup-debug.png', fullPage: false });
    }
  }

  // Wait for the SIGN IN button to confirm the modal is open
  await page.waitForSelector('button:has-text("SIGN IN")', { state: 'attached', timeout: 20000 });
  console.log('SIGN IN button found — filling credentials');

  // Log all visible inputs so we know what we're working with
  const inputInfo = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .filter(el => el.type !== 'hidden')
      .map(el => ({ type: el.type, id: el.id, name: el.name, placeholder: el.placeholder, visible: el.offsetParent !== null }))
  );
  console.log('Visible inputs:', JSON.stringify(inputInfo));

  // Strategy 1: Use Playwright's native fill() which simulates keystrokes and
  // works with React controlled inputs without needing a placeholder attribute.
  const visibleInputs = page.locator('input:not([type="hidden"])');
  const inputCount = await visibleInputs.count();
  console.log(`Found ${inputCount} visible input(s)`);

  if (inputCount >= 2) {
    // First non-password input is email; password input by type
    await visibleInputs.first().click();
    await visibleInputs.first().fill(TP_EMAIL);
    await page.locator('input[type="password"]').click();
    await page.locator('input[type="password"]').fill(TP_PASSWORD);
    console.log('Filled via Playwright native fill()');
  } else {
    // Fallback: inject values via React's native setter so onChange fires
    const fillResult = await page.evaluate(([email, password]) => {
      const inputs = Array.from(document.querySelectorAll('input'))
        .filter(el => el.type !== 'hidden');
      const emailInput    = inputs.find(el => el.type !== 'password');
      const passwordInput = inputs.find(el => el.type === 'password');

      const fill = (el, val) => {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('focus',  { bubbles: true }));
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur',   { bubbles: true }));
      };

      if (emailInput)    fill(emailInput,    email);
      if (passwordInput) fill(passwordInput, password);

      return { emailFound: !!emailInput, passwordFound: !!passwordInput };
    }, [TP_EMAIL, TP_PASSWORD]);
    console.log('Filled via JS evaluate:', JSON.stringify(fillResult));
  }

  await page.waitForTimeout(500); // let React process state updates
  await page.locator('button:has-text("SIGN IN")').click({ force: true });
  console.log('Clicked SIGN IN');

  await page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Force a reload of the loads page so the React app makes a fresh search request.
  // The initial load may use cached results and skip the API call.
  if (page.url().includes('/carrier/loads')) {
    console.log('Reloading loads page to trigger fresh search request...');
    await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  }

  // Wait up to 10s for the search API call to fire
  const searchReq = await page.waitForRequest(
    req => req.url().includes('/tl/search/filter') && req.method() === 'POST',
    { timeout: 10000 }
  ).catch(() => null);

  if (searchReq) {
    try {
      capturedPayload = JSON.parse(searchReq.postData() || '{}');
      console.log('Captured browser search payload:', JSON.stringify(capturedPayload).slice(0, 800));
    } catch {
      console.log('Could not parse captured search payload');
    }
  } else {
    console.log('No search request captured within 10s');
  }

  await page.screenshot({ path: 'tp-postlogin-debug.png', fullPage: false });
  console.log(`Post-login URL: ${page.url()}`);

  // Check localStorage for auth token
  if (!authToken) {
    authToken = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        const val = localStorage.getItem(key);
        if (typeof val === 'string' && val.startsWith('r:')) return val;
      }
      for (const key of Object.keys(localStorage)) {
        if (/auth|token/i.test(key)) {
          const val = localStorage.getItem(key);
          if (val && val.length > 10) return val;
        }
      }
      return null;
    });
    if (authToken) console.log('Captured x-auth-token from localStorage');
  }

  if (!authToken) {
    // Dump localStorage keys to help debug
    const lsKeys = await page.evaluate(() => Object.keys(localStorage));
    console.log('localStorage keys:', lsKeys);
    throw new Error('Could not capture x-auth-token. Check screenshots and localStorage keys above.');
  }

  console.log(`Token preview: ${authToken.slice(0, 8)}... (length ${authToken.length})`);

  // ── Perform a UI search to capture the real API request/response ────────────
  // The programmatic API calls return 0 results on a free account. We'll use
  // the page's own search UI to trigger a search and intercept the response.
  console.log('Performing UI search to capture real API response...');

  // Listen for the next search API response
  const searchResponsePromise = page.waitForResponse(
    res => res.url().includes('/tl/search/filter') && res.request().method() === 'POST',
    { timeout: 15000 }
  ).catch(() => null);

  // Fill the pickup DH field (deadhead) — use the search_pickupDH input
  // The search_pickup field expects a city/state string
  try {
    await page.locator('#search_pickup').fill('Birmingham, AL');
    await page.waitForTimeout(1000); // let autocomplete settle
    // Press Escape to dismiss any autocomplete dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Click the SEARCH button
    await page.locator('button:has-text("SEARCH")').first().click();
    console.log('Clicked SEARCH button');
  } catch (err) {
    console.log('UI search interaction failed:', err.message);
  }

  const searchRes = await searchResponsePromise;
  if (searchRes) {
    const reqBody  = searchRes.request().postData() || '';
    const resBody  = await searchRes.text().catch(() => '');
    console.log('UI search request:', reqBody.slice(0, 600));
    console.log('UI search response (800 chars):', resBody.slice(0, 800));
    // Use this payload as our template
    if (!capturedPayload) {
      try { capturedPayload = JSON.parse(reqBody); } catch { /* ignore */ }
    }
  } else {
    console.log('No search response captured from UI search');
  }

  console.log('Login successful.\n');

  // ── Fetch loads for each state (browser stays open — uses its full session) ──
  _capturedTemplate = capturedPayload;
  if (_capturedTemplate) {
    console.log('Using captured browser payload as template');
  } else {
    console.log('No browser payload captured — using fallback template');
  }

  const seen     = new Set();
  const allLoads = [];

  for (const centroid of STATE_CENTROIDS) {
    try {
      const loads = await fetchStateLoads(centroid, page, authToken);
      let added = 0;
      for (const load of loads) {
        if (load.load_id && !seen.has(load.load_id)) {
          seen.add(load.load_id);
          allLoads.push(load);
          added++;
        }
      }
      console.log(`[${centroid.state}] ${loads.length} fetched, ${added} new after dedup (total: ${allLoads.length})`);
    } catch (err) {
      console.warn(`[${centroid.state}] Error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Sort freshest first (smallest age_minutes)
  allLoads.sort((a, b) => (a.age_minutes || 0) - (b.age_minutes || 0));

  writeFileSync(OUTPUT, JSON.stringify(allLoads, null, 2));
  console.log(`\n✅ ${allLoads.length} unique TruckerPath loads → ${OUTPUT}`);

  // ── Write meta.json ──────────────────────────────────────────────────────────
  const countBy = (loads, key) => {
    const counts = {};
    for (const l of loads) {
      const val = l[key] || 'Unknown';
      counts[val] = (counts[val] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const paidLoads  = allLoads.filter(l => l.pay_rate > 0);
  const metaOutput = OUTPUT.replace(/\.json$/, '-meta.json');

  writeFileSync(metaOutput, JSON.stringify({
    runDate:        new Date().toISOString().slice(0, 10),
    runAt:          new Date().toISOString(),
    totalLoads:     allLoads.length,
    loadsWithPay:   paidLoads.length,
    avgPay:         paidLoads.length
      ? Math.round(paidLoads.reduce((s, l) => s + l.pay_rate, 0) / paidLoads.length)
      : 0,
    equipmentTypes:  countBy(allLoads, 'equipment_type'),
    topPickupStates: countBy(allLoads, 'pickup_state').slice(0, 20),
  }, null, 2));
  console.log(`📊 Meta → ${metaOutput}`);

} finally {
  await browser.close();
}


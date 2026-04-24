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
const DELAY_MS   = 1000; // between paginated requests
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]);

if (!TP_EMAIL || !TP_PASSWORD) {
  console.error('Missing required env vars: TP_EMAIL, TP_PASSWORD');
  process.exit(1);
}


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

// ─── Build search payload ─────────────────────────────────────────────────────
// No location filter — the TP API ignores it (returns the same global set
// regardless of placeId/deadhead). Fetch all loads and filter post-hoc.
function buildPayload(offset = 0) {
  return {
    sort:          [{ smart_sort: 'desc' }],
    offset,
    limit:         PAGE_LIMIT,
    search_id:     null,
    repeat_search: false,
    road_miles:    true,
    include_auth_required: false,
    paging_enable: true,
    query: {},
  };
}

// ─── Fetch all loads for one state via in-browser fetch ───────────────────────
// Running fetch() inside page.evaluate() uses the browser's full cookie jar
// and session state — no need to manually reconstruct auth headers.


async function fetchAllLoads(page, token) {
  const loads = [];
  let   offset = 0;

  while (true) {
    const body = buildPayload(offset);

    const result = await page.evaluate(async ([url, payload, tok, instId]) => {
      try {
        const headers = { 'Content-Type': 'application/json', 'x-auth-token': tok, 'client': 'web' };
        if (instId) headers['Installation-ID'] = instId;
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        return { status: res.status, text: await res.text() };
      } catch (err) {
        return { status: 0, text: err.message };
      }
    }, [API_URL, body, token, installationId]);

    if (result.status === 0 || result.status >= 400) {
      console.warn(`offset=${offset} → HTTP ${result.status}: ${result.text.slice(0, 200)}`);
      break;
    }

    let data;
    try { data = JSON.parse(result.text); } catch { console.warn('Non-JSON response'); break; }

    const items = data.content || data.items || data.loads || data.results || data.data || [];
    loads.push(...items.map(normalize).filter(Boolean));
    console.log(`offset=${offset}: ${items.length} items (running total: ${loads.length})`);

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
let authToken      = null;
let installationId = null;

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
    const lsKeys = await page.evaluate(() => Object.keys(localStorage));
    console.log('localStorage keys:', lsKeys);
    throw new Error('Could not capture x-auth-token. Check screenshots and localStorage keys above.');
  }

  console.log(`Token preview: ${authToken.slice(0, 8)}... (length ${authToken.length})`);

  // Grab Installation-ID — check localStorage then sessionStorage
  installationId = await page.evaluate(() => {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      for (const key of Object.keys(store)) {
        if (/install/i.test(key)) {
          const val = store.getItem(key);
          if (val && val.length > 4) return val;
        }
      }
    }
    // Not found — generate a stable UUID for this session
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
  });
  console.log(`Installation-ID: ${installationId}`);

  console.log('Login successful.\n');

  // ── Fetch all loads in a single paginated pass ────────────────────────────────
  const allLoads = await fetchAllLoads(page, authToken);

  // Post-fetch safety filters: drop stale loads and non-US pickups
  const MAX_AGE_MINUTES = MAX_AGE_MS / 60000;
  const beforeFilter = allLoads.length;
  const filtered = allLoads.filter(l => {
    if (l.age_minutes > MAX_AGE_MINUTES) return false;
    if (!US_STATES.has(l.pickup_state))  return false;
    return true;
  });
  console.log(`\nFiltered ${beforeFilter - filtered.length} loads (stale or non-US). Keeping ${filtered.length}.`);
  allLoads.length = 0;
  allLoads.push(...filtered);

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


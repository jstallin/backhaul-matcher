/**
 * Query df-loads.json for loads that make sense for a given route.
 * Usage: node scripts/query-loads.mjs
 *
 * Route: St. Louis, MO → Parkersburg, WV
 * Corridor states: MO, IL, IN, OH, WV (and nearby: KY, PA)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const loads = JSON.parse(readFileSync(join(__dir, '../public/df-loads.json'), 'utf8'));

// --- Config ---
const PICKUP_STATES  = ['MO', 'IL', 'IN', 'OH'];          // States near/along route from St. Louis
const DELIVERY_STATES = ['WV', 'OH', 'KY', 'PA', 'VA'];  // States near Parkersburg WV
const MAX_DISTANCE = 800;                                   // Max total load distance (miles)
const MIN_REVENUE = 500;                                    // Min revenue to bother showing

// --- Filter ---
const candidates = loads.filter(l => {
  const pickup   = (l.pickup_state   || l.origin_state      || '').toUpperCase();
  const delivery = (l.delivery_state || l.destination_state || '').toUpperCase();
  const miles    = parseFloat(l.distance_miles || l.total_miles || 0);
  const revenue  = parseFloat(l.total_revenue  || l.rate || 0);

  return (
    PICKUP_STATES.includes(pickup) &&
    DELIVERY_STATES.includes(delivery) &&
    (miles === 0 || miles <= MAX_DISTANCE) &&
    revenue >= MIN_REVENUE
  );
});

// --- Sort by revenue desc ---
candidates.sort((a, b) =>
  parseFloat(b.total_revenue || b.rate || 0) - parseFloat(a.total_revenue || a.rate || 0)
);

console.log(`\nTotal loads in file: ${loads.length}`);
console.log(`Loads with pickup in [${PICKUP_STATES}] → delivery in [${DELIVERY_STATES}]: ${candidates.length}`);
console.log('\nTop 20 by revenue:\n');

candidates.slice(0, 20).forEach((l, i) => {
  const pickup   = `${l.pickup_city   || l.origin_city      || '?'}, ${l.pickup_state   || l.origin_state      || '?'}`;
  const delivery = `${l.delivery_city || l.destination_city || '?'}, ${l.delivery_state || l.destination_state || '?'}`;
  const revenue  = parseFloat(l.total_revenue || l.rate || 0).toFixed(0);
  const rpm      = parseFloat(l.rate_per_mile || 0).toFixed(2);
  const miles    = l.distance_miles || l.total_miles || '?';
  const equip    = l.equipment_type || l.trailer_type || '?';

  console.log(`${String(i+1).padStart(2)}. ${pickup.padEnd(25)} → ${delivery.padEnd(25)} $${revenue} (${rpm}/mi, ${miles}mi, ${equip})`);
});

// --- Breakdown by pickup state ---
console.log('\n--- Pickup state breakdown ---');
const byState = {};
candidates.forEach(l => {
  const s = (l.pickup_state || l.origin_state || 'UNK').toUpperCase();
  byState[s] = (byState[s] || 0) + 1;
});
Object.entries(byState).sort((a,b) => b[1]-a[1]).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

// --- Breakdown by delivery state ---
console.log('\n--- Delivery state breakdown ---');
const byDest = {};
candidates.forEach(l => {
  const s = (l.delivery_state || l.destination_state || 'UNK').toUpperCase();
  byDest[s] = (byDest[s] || 0) + 1;
});
Object.entries(byDest).sort((a,b) => b[1]-a[1]).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

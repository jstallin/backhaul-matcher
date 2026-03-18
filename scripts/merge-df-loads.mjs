/**
 * Merges multiple df-loads-*.json files into public/df-loads.json.
 * Deduplicates by load_id, sorts by age_minutes (freshest first).
 * Writes a markdown diff report to diff-reports/df-loads-diff-YYYY-MM-DD.md
 * before overwriting the existing file.
 *
 * Usage: node scripts/merge-df-loads.mjs <file1.json> <file2.json> ...
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputFiles = process.argv.slice(2);
if (inputFiles.length === 0) {
  console.error('Usage: node scripts/merge-df-loads.mjs <file1.json> <file2.json> ...');
  process.exit(1);
}

// --- Merge incoming files ---
const seen = new Set();
const merged = [];

for (const file of inputFiles) {
  try {
    const loads = JSON.parse(readFileSync(file, 'utf8'));
    let added = 0;
    for (const load of loads) {
      if (!seen.has(load.load_id)) {
        seen.add(load.load_id);
        merged.push(load);
        added++;
      }
    }
    console.log(`${file}: ${loads.length} records, ${added} new after dedup`);
  } catch (err) {
    console.warn(`Skipping ${file}: ${err.message}`);
  }
}

// Sort by age_minutes ascending (freshest loads first)
merged.sort((a, b) => (a.age_minutes || 0) - (b.age_minutes || 0));

// --- Load existing file for diff ---
const outputPath = resolve(__dirname, '../public/df-loads.json');
let existing = [];
try {
  existing = JSON.parse(readFileSync(outputPath, 'utf8'));
  console.log(`\nExisting df-loads.json: ${existing.length} loads`);
} catch {
  console.log('\nNo existing df-loads.json found — first run.');
}

// --- Build diff ---
const existingById = new Map(existing.map(l => [l.load_id, l]));
const newById      = new Map(merged.map(l => [l.load_id, l]));

const added   = merged.filter(l => !existingById.has(l.load_id));
const removed = existing.filter(l => !newById.has(l.load_id));

// --- Stats helpers ---
const countBy = (loads, key) => {
  const counts = {};
  for (const l of loads) {
    const val = l[key] || 'Unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
};

const avgPay = (loads) => {
  const paid = loads.filter(l => l.pay_rate > 0);
  if (!paid.length) return 'N/A';
  const avg = paid.reduce((s, l) => s + l.pay_rate, 0) / paid.length;
  return `$${Math.round(avg).toLocaleString()}`;
};

const fmtLoad = (l) =>
  `${l.pickup_city || '?'}, ${l.pickup_state} → ${l.delivery_city || '?'}, ${l.delivery_state} | ${l.equipment_type} | $${(l.pay_rate || 0).toLocaleString()} | ${l.distance_miles || '?'} mi`;

// --- Write diff report ---
const date = new Date().toISOString().slice(0, 10);
const reportDir = resolve(__dirname, '../diff-reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = resolve(reportDir, `df-loads-diff-${date}.md`);

const lines = [];
lines.push(`# DirectFreight Load Diff — ${date}`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| | Count |`);
lines.push(`|---|---|`);
lines.push(`| Previous total | ${existing.length} |`);
lines.push(`| New total | ${merged.length} |`);
lines.push(`| Net change | ${merged.length >= existing.length ? '+' : ''}${merged.length - existing.length} |`);
lines.push(`| Added | +${added.length} |`);
lines.push(`| Removed | -${removed.length} |`);
lines.push(`| Avg pay (new file) | ${avgPay(merged)} |`);
lines.push('');

// Equipment type breakdown
lines.push('## Equipment Types (new file)');
lines.push('');
lines.push('| Type | Count |');
lines.push('|---|---|');
for (const [type, count] of countBy(merged, 'equipment_type')) {
  lines.push(`| ${type} | ${count} |`);
}
lines.push('');

// State breakdown (pickup)
lines.push('## Pickup States (new file, top 15)');
lines.push('');
lines.push('| State | Count |');
lines.push('|---|---|');
for (const [state, count] of countBy(merged, 'pickup_state').slice(0, 15)) {
  lines.push(`| ${state} | ${count} |`);
}
lines.push('');

// Added loads
if (added.length > 0) {
  lines.push(`## Added Loads (+${added.length})`);
  lines.push('');
  lines.push('| Route | Equip | Pay | Miles |');
  lines.push('|---|---|---|---|');
  for (const l of added.slice(0, 100)) {
    const route = `${l.pickup_city || '?'}, ${l.pickup_state} → ${l.delivery_city || '?'}, ${l.delivery_state}`;
    lines.push(`| ${route} | ${l.equipment_type} | $${(l.pay_rate || 0).toLocaleString()} | ${l.distance_miles || '?'} |`);
  }
  if (added.length > 100) lines.push(`| … and ${added.length - 100} more | | | |`);
  lines.push('');
} else {
  lines.push('## Added Loads\n\nNone.\n');
}

// Removed loads
if (removed.length > 0) {
  lines.push(`## Removed Loads (-${removed.length})`);
  lines.push('');
  lines.push('| Route | Equip | Pay | Miles |');
  lines.push('|---|---|---|---|');
  for (const l of removed.slice(0, 100)) {
    const route = `${l.pickup_city || '?'}, ${l.pickup_state} → ${l.delivery_city || '?'}, ${l.delivery_state}`;
    lines.push(`| ${route} | ${l.equipment_type} | $${(l.pay_rate || 0).toLocaleString()} | ${l.distance_miles || '?'} |`);
  }
  if (removed.length > 100) lines.push(`| … and ${removed.length - 100} more | | | |`);
  lines.push('');
} else {
  lines.push('## Removed Loads\n\nNone.\n');
}

writeFileSync(reportPath, lines.join('\n'));
console.log(`📋 Diff report → diff-reports/df-loads-diff-${date}.md`);
console.log(`   +${added.length} added, -${removed.length} removed`);

// --- Write meta.json for admin dashboard ---
const paidLoads = merged.filter(l => l.pay_rate > 0);
const avgPayRaw = paidLoads.length
  ? Math.round(paidLoads.reduce((s, l) => s + l.pay_rate, 0) / paidLoads.length)
  : 0;

const metaPath = resolve(__dirname, '../public/df-loads-meta.json');
writeFileSync(metaPath, JSON.stringify({
  runDate: date,
  runAt: new Date().toISOString(),
  totalLoads: merged.length,
  previousTotal: existing.length,
  netChange: merged.length - existing.length,
  added: added.length,
  removed: removed.length,
  avgPay: avgPayRaw,
  loadsWithPay: paidLoads.length,
  equipmentTypes: countBy(merged, 'equipment_type'),
  topPickupStates: countBy(merged, 'pickup_state').slice(0, 20),
}, null, 2));
console.log(`📊 Meta → public/df-loads-meta.json`);

// --- Overwrite df-loads.json ---
writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.log(`\n✅ Merged ${merged.length} unique loads → public/df-loads.json`);

/**
 * Merges multiple df-loads-*.json files into public/df-loads.json.
 * Deduplicates by load_id, sorts by age_minutes (freshest first).
 *
 * Usage: node scripts/merge-df-loads.mjs <file1.json> <file2.json> ...
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputFiles = process.argv.slice(2);
if (inputFiles.length === 0) {
  console.error('Usage: node scripts/merge-df-loads.mjs <file1.json> <file2.json> ...');
  process.exit(1);
}

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

const outputPath = resolve(__dirname, '../public/df-loads.json');
writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.log(`\n✅ Merged ${merged.length} unique loads → public/df-loads.json`);

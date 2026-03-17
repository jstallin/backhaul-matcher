/**
 * Geocode missing lat/lng in df-loads.json using Nominatim (OSM).
 * Deduplicates by city+state so each unique location is only looked up once.
 * Nominatim rate limit: 1 request/second (enforced here).
 *
 * Usage: node scripts/geocode-df-loads.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dir, '../public/df-loads.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocodeCity(city, state) {
  const query = `${city}, ${state}, United States`;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'BackhaulMatcher/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data[0]?.lat && data[0]?.lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn(`  Error geocoding "${city}, ${state}":`, e.message);
  }
  return null;
}

const loads = JSON.parse(readFileSync(jsonPath, 'utf8'));
console.log(`Loaded ${loads.length} loads from df-loads.json`);

// Collect unique city+state pairs that need geocoding
const needed = new Map(); // "City,ST" -> { city, state }
for (const load of loads) {
  if (load.pickup_lat == null && load.pickup_city && load.pickup_state) {
    const key = `${load.pickup_city},${load.pickup_state}`;
    if (!needed.has(key)) needed.set(key, { city: load.pickup_city, state: load.pickup_state });
  }
  if (load.delivery_lat == null && load.delivery_city && load.delivery_state) {
    const key = `${load.delivery_city},${load.delivery_state}`;
    if (!needed.has(key)) needed.set(key, { city: load.delivery_city, state: load.delivery_state });
  }
}

console.log(`Unique city/state pairs to geocode: ${needed.size}`);

// Geocode each unique pair
const coordCache = new Map();
let done = 0, failed = 0;

for (const [key, { city, state }] of needed) {
  process.stdout.write(`[${done + failed + 1}/${needed.size}] ${city}, ${state} ... `);
  const coords = await geocodeCity(city, state);
  if (coords) {
    coordCache.set(key, coords);
    console.log(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    done++;
  } else {
    console.log('FAILED');
    failed++;
  }
  await sleep(1100); // Nominatim: max 1 req/sec
}

console.log(`\nGeocoded: ${done}  Failed: ${failed}`);

// Apply coordinates back to all loads
let updated = 0;
for (const load of loads) {
  let changed = false;
  if (load.pickup_lat == null && load.pickup_city && load.pickup_state) {
    const coords = coordCache.get(`${load.pickup_city},${load.pickup_state}`);
    if (coords) { load.pickup_lat = coords.lat; load.pickup_lng = coords.lng; changed = true; }
  }
  if (load.delivery_lat == null && load.delivery_city && load.delivery_state) {
    const coords = coordCache.get(`${load.delivery_city},${load.delivery_state}`);
    if (coords) { load.delivery_lat = coords.lat; load.delivery_lng = coords.lng; changed = true; }
  }
  if (changed) updated++;
}

console.log(`Updated ${updated} load records`);
writeFileSync(jsonPath, JSON.stringify(loads, null, 2));
console.log(`Saved to ${jsonPath}`);

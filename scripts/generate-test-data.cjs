#!/usr/bin/env node
/**
 * Generate realistic backhaul test data for Southeast US
 * Run with: node scripts/generate-test-data.js
 */

const fs = require('fs');
const path = require('path');

// Southeast US cities with lat/lng
const CITIES = {
  FL: [
    { city: 'Jacksonville', lat: 30.3322, lng: -81.6557 },
    { city: 'Miami', lat: 25.7617, lng: -80.1918 },
    { city: 'Tampa', lat: 27.9506, lng: -82.4572 },
    { city: 'Orlando', lat: 28.5383, lng: -81.3792 },
    { city: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373 },
    { city: 'Tallahassee', lat: 30.4383, lng: -84.2807 },
    { city: 'Pensacola', lat: 30.4213, lng: -87.2169 },
    { city: 'Gainesville', lat: 29.6516, lng: -82.3248 },
    { city: 'Ocala', lat: 29.1872, lng: -82.1401 },
    { city: 'Lakeland', lat: 28.0395, lng: -81.9498 },
    { city: 'Daytona Beach', lat: 29.2108, lng: -81.0228 },
    { city: 'Sarasota', lat: 27.3364, lng: -82.5307 },
    { city: 'Fort Myers', lat: 26.6406, lng: -81.8723 },
    { city: 'Palm Bay', lat: 28.0345, lng: -80.5887 },
    { city: 'Port St Lucie', lat: 27.2730, lng: -80.3582 },
  ],
  GA: [
    { city: 'Atlanta', lat: 33.7490, lng: -84.3880 },
    { city: 'Savannah', lat: 32.0809, lng: -81.0912 },
    { city: 'Augusta', lat: 33.4735, lng: -81.9748 },
    { city: 'Macon', lat: 32.8407, lng: -83.6324 },
    { city: 'Columbus', lat: 32.4610, lng: -84.9877 },
    { city: 'Albany', lat: 31.5785, lng: -84.1557 },
    { city: 'Valdosta', lat: 30.8327, lng: -83.2785 },
    { city: 'Athens', lat: 33.9519, lng: -83.3576 },
    { city: 'Dalton', lat: 34.7698, lng: -84.9702 },
    { city: 'Brunswick', lat: 31.1499, lng: -81.4915 },
  ],
  NC: [
    { city: 'Charlotte', lat: 35.2271, lng: -80.8431 },
    { city: 'Raleigh', lat: 35.7796, lng: -78.6382 },
    { city: 'Greensboro', lat: 36.0726, lng: -79.7920 },
    { city: 'Durham', lat: 35.9940, lng: -78.8986 },
    { city: 'Winston-Salem', lat: 36.0999, lng: -80.2442 },
    { city: 'Fayetteville', lat: 35.0527, lng: -78.8784 },
    { city: 'Wilmington', lat: 34.2257, lng: -77.9447 },
    { city: 'Asheville', lat: 35.5951, lng: -82.5515 },
    { city: 'Hickory', lat: 35.7330, lng: -81.3412 },
    { city: 'Cornelius', lat: 35.4832, lng: -80.8590 },
    { city: 'Davidson', lat: 35.4993, lng: -80.8487 },
    { city: 'Statesville', lat: 35.7826, lng: -80.8873 },
  ],
  SC: [
    { city: 'Charleston', lat: 32.7765, lng: -79.9311 },
    { city: 'Columbia', lat: 34.0007, lng: -81.0348 },
    { city: 'Greenville', lat: 34.8526, lng: -82.3940 },
    { city: 'Spartanburg', lat: 34.9496, lng: -81.9320 },
    { city: 'Myrtle Beach', lat: 33.6891, lng: -78.8867 },
    { city: 'Florence', lat: 34.1954, lng: -79.7626 },
    { city: 'Rock Hill', lat: 34.9249, lng: -81.0251 },
    { city: 'Anderson', lat: 34.5034, lng: -82.6501 },
  ],
  TN: [
    { city: 'Nashville', lat: 36.1627, lng: -86.7816 },
    { city: 'Memphis', lat: 35.1495, lng: -90.0490 },
    { city: 'Knoxville', lat: 35.9606, lng: -83.9207 },
    { city: 'Chattanooga', lat: 35.0456, lng: -85.3097 },
    { city: 'Murfreesboro', lat: 35.8456, lng: -86.3903 },
    { city: 'Clarksville', lat: 36.5298, lng: -87.3595 },
    { city: 'Johnson City', lat: 36.3134, lng: -82.3535 },
    { city: 'Jackson', lat: 35.6145, lng: -88.8139 },
  ],
  AL: [
    { city: 'Birmingham', lat: 33.5207, lng: -86.8025 },
    { city: 'Montgomery', lat: 32.3792, lng: -86.3077 },
    { city: 'Mobile', lat: 30.6954, lng: -88.0399 },
    { city: 'Huntsville', lat: 34.7304, lng: -86.5861 },
    { city: 'Tuscaloosa', lat: 33.2098, lng: -87.5692 },
    { city: 'Dothan', lat: 31.2232, lng: -85.3905 },
    { city: 'Decatur', lat: 34.6059, lng: -86.9833 },
    { city: 'Auburn', lat: 32.6099, lng: -85.4808 },
  ],
  VA: [
    { city: 'Virginia Beach', lat: 36.8529, lng: -75.9780 },
    { city: 'Norfolk', lat: 36.8508, lng: -76.2859 },
    { city: 'Richmond', lat: 37.5407, lng: -77.4360 },
    { city: 'Roanoke', lat: 37.2710, lng: -79.9414 },
    { city: 'Lynchburg', lat: 37.4138, lng: -79.1422 },
    { city: 'Chesapeake', lat: 36.7682, lng: -76.2875 },
    { city: 'Newport News', lat: 37.0871, lng: -76.4730 },
    { city: 'Fredericksburg', lat: 38.3032, lng: -77.4605 },
  ],
  MS: [
    { city: 'Jackson', lat: 32.2988, lng: -90.1848 },
    { city: 'Gulfport', lat: 30.3674, lng: -89.0928 },
    { city: 'Hattiesburg', lat: 31.3271, lng: -89.2903 },
    { city: 'Meridian', lat: 32.3643, lng: -88.7037 },
    { city: 'Tupelo', lat: 34.2576, lng: -88.7034 },
    { city: 'Biloxi', lat: 30.3960, lng: -88.8853 },
  ],
  LA: [
    { city: 'New Orleans', lat: 29.9511, lng: -90.0715 },
    { city: 'Baton Rouge', lat: 30.4515, lng: -91.1871 },
    { city: 'Shreveport', lat: 32.5252, lng: -93.7502 },
    { city: 'Lafayette', lat: 30.2241, lng: -92.0198 },
    { city: 'Lake Charles', lat: 30.2266, lng: -93.2174 },
    { city: 'Monroe', lat: 32.5093, lng: -92.1193 },
  ],
};

const EQUIPMENT_TYPES = [
  { type: 'Dry Van', code: 'V', weight: [15000, 45000], length: [48, 53], pct: 0.60 },
  { type: 'Flatbed', code: 'F', weight: [20000, 48000], length: [48, 53], pct: 0.25 },
  { type: 'Reefer', code: 'R', weight: [15000, 44000], length: [48, 53], pct: 0.15 },
];

const BROKERS = ['DAT', 'CH Robinson', 'Echo Global', 'TQL', 'Coyote', 'XPO Logistics', 'Landstar', 'JB Hunt', 'Schneider', 'Werner'];

const SHIPPERS = [
  'US Foods', 'Sysco', 'Costco Wholesale', 'Walmart Logistics', 'Target Distribution',
  'FedEx Freight', 'Home Depot Supply', 'Lowes Distribution', 'Amazon Logistics', 'PepsiCo',
  'Coca-Cola Bottling', 'Procter & Gamble', 'Nestle USA', 'Tyson Foods', 'Pilgrim\'s Pride',
  'Georgia-Pacific', 'International Paper', 'Kimberly-Clark', 'General Mills', 'Kraft Heinz',
  'Anheuser-Busch', 'John Deere', 'Caterpillar', 'Ford Motor Supply', 'BMW Manufacturing',
  'Michelin NA', 'Bridgestone Americas', 'Dollar General DC', 'Dollar Tree DC', 'Publix Distribution',
  'Express Logistics', 'Premium Freight Co', 'Southeast Carriers', 'Piedmont Logistics', 'Palmetto Transport',
];

const RECEIVERS = [
  'Davidson Distribution', 'Charlotte Warehouse', 'Regional DC Southeast', 'Costco #1234',
  'Walmart DC #456', 'Target DC Atlanta', 'Home Depot DC', 'FedEx Ground Hub',
  'Amazon Fulfillment', 'Kroger Distribution', 'Food Lion DC', 'Harris Teeter DC',
  'Publix Distribution', 'Ingles Markets DC', 'BiLo Distribution', 'Piggly Wiggly DC',
];

const FREIGHT_TYPES = [
  'General Freight', 'Food Products', 'Beverages', 'Electronics', 'Textiles',
  'Paper Products', 'Building Materials', 'Auto Parts', 'Chemicals', 'Machinery',
  'Consumer Goods', 'Furniture', 'Produce', 'Frozen Foods', 'Dry Goods',
  'Hardware', 'Plastics', 'Metal Products', 'Pharmaceuticals', 'Household Goods',
];

// Helpers
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(items) {
  const r = Math.random();
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.pct;
    if (r <= cumulative) return item;
  }
  return items[items.length - 1];
}

// Haversine distance
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Get all cities as flat array
const allCities = [];
for (const [state, cities] of Object.entries(CITIES)) {
  for (const city of cities) {
    allCities.push({ ...city, state });
  }
}

function generateLoad(index) {
  // Pick origin and destination (different states preferred, but same state OK sometimes)
  let origin, destination;
  do {
    origin = pick(allCities);
    destination = pick(allCities);
  } while (origin.city === destination.city && origin.state === destination.state);

  const distance = Math.round(haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng));

  // Skip if too short
  if (distance < 50) return null;

  // Equipment
  const equipment = pickWeighted(EQUIPMENT_TYPES);

  // Rate per mile varies by equipment, distance, and randomness
  // Short hauls pay more per mile, long hauls less
  let baseRpm;
  if (distance < 200) baseRpm = rand(2.50, 3.50);
  else if (distance < 500) baseRpm = rand(2.00, 3.00);
  else if (distance < 800) baseRpm = rand(1.75, 2.75);
  else baseRpm = rand(1.50, 2.50);

  // Reefer premium
  if (equipment.type === 'Reefer') baseRpm += rand(0.20, 0.50);
  // Flatbed premium
  if (equipment.type === 'Flatbed') baseRpm += rand(0.10, 0.30);

  const ratePerMile = Math.round(baseRpm * 100) / 100;
  const totalRevenue = Math.round(ratePerMile * distance * 100) / 100;

  // Weight and length within equipment range
  const weight = randInt(equipment.weight[0], equipment.weight[1]);
  const trailerLength = pick([48, 53]);

  // Dates - spread across next 30 days
  const today = new Date();
  const pickupOffset = randInt(0, 30);
  const pickupDate = new Date(today);
  pickupDate.setDate(today.getDate() + pickupOffset);
  const deliveryDate = new Date(pickupDate);
  deliveryDate.setDate(pickupDate.getDate() + Math.max(1, Math.ceil(distance / 500)));

  const formatDate = (d) => d.toISOString().split('T')[0];

  // Add slight lat/lng jitter to avoid exact overlaps
  const jitter = () => (Math.random() - 0.5) * 0.05;

  return {
    load_id: `LOAD-${String(index).padStart(5, '0')}`,
    broker: pick(BROKERS),
    shipper: pick(SHIPPERS),
    receiver: pick(RECEIVERS),
    freight_type: pick(FREIGHT_TYPES),
    equipment_type: equipment.type,
    equipment_code: equipment.code,
    pickup_city: origin.city,
    pickup_state: origin.state,
    pickup_lat: Math.round((origin.lat + jitter()) * 10000) / 10000,
    pickup_lng: Math.round((origin.lng + jitter()) * 10000) / 10000,
    pickup_date: formatDate(pickupDate),
    delivery_city: destination.city,
    delivery_state: destination.state,
    delivery_lat: Math.round((destination.lat + jitter()) * 10000) / 10000,
    delivery_lng: Math.round((destination.lng + jitter()) * 10000) / 10000,
    delivery_date: formatDate(deliveryDate),
    distance_miles: distance,
    weight_lbs: weight,
    trailer_length: trailerLength,
    revenue_per_mile: ratePerMile,
    total_revenue: totalRevenue,
    status: 'available',
    posted_date: formatDate(today) + ` ${randInt(6, 23)}:${String(randInt(0, 59)).padStart(2, '0')}`
  };
}

// Generate loads
console.log('Generating 10,000 realistic Southeast US backhaul loads...');

const loads = [];
let attempts = 0;
const TARGET = 10000;

while (loads.length < TARGET && attempts < TARGET * 3) {
  attempts++;
  const load = generateLoad(loads.length + 1);
  if (load) loads.push(load);
}

console.log(`Generated ${loads.length} loads in ${attempts} attempts`);

// Stats
const byEquipment = {};
const byPickupState = {};
const byDeliveryState = {};
let totalDist = 0;
let totalRev = 0;

loads.forEach(l => {
  byEquipment[l.equipment_type] = (byEquipment[l.equipment_type] || 0) + 1;
  byPickupState[l.pickup_state] = (byPickupState[l.pickup_state] || 0) + 1;
  byDeliveryState[l.delivery_state] = (byDeliveryState[l.delivery_state] || 0) + 1;
  totalDist += l.distance_miles;
  totalRev += l.total_revenue;
});

console.log('\nBy equipment:', byEquipment);
console.log('By pickup state:', byPickupState);
console.log('By delivery state:', byDeliveryState);
console.log(`Avg distance: ${Math.round(totalDist / loads.length)} mi`);
console.log(`Avg revenue: $${(totalRev / loads.length).toFixed(2)}`);
console.log(`Revenue range: $${Math.min(...loads.map(l => l.total_revenue)).toFixed(2)} - $${Math.max(...loads.map(l => l.total_revenue)).toFixed(2)}`);
console.log(`Distance range: ${Math.min(...loads.map(l => l.distance_miles))} - ${Math.max(...loads.map(l => l.distance_miles))} mi`);

// Write output
const outputPath = path.join(__dirname, '..', 'src', 'data', 'backhaul_loads_data.json');
fs.writeFileSync(outputPath, JSON.stringify(loads, null, 2));
console.log(`\nWritten to ${outputPath}`);

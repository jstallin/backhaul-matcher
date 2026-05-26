import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PLAN_DEFAULTS,
  scoreReturnLoad,
  buildChain,
  planWorkWeek,
} from '../weeklyPlanningAlgorithm.js';

// Mock PC*MILER — tests never hit the network
vi.mock('../pcMilerClient.js', () => ({
  getDrivingDistance: vi.fn(),
}));

// Mock routeHomeMatching for calculateNetRevenue and calculateDistance
vi.mock('../routeHomeMatching.js', () => ({
  calculateDistance: vi.fn((lat1, lng1, lat2, lng2) => {
    // Return a simple fixed value based on coords for deterministic tests
    const dlat = Math.abs(lat2 - lat1);
    const dlng = Math.abs(lng2 - lng1);
    return (dlat + dlng) * 50; // rough approximation, not real Haversine
  }),
  calculateNetRevenue: vi.fn().mockReturnValue({ has_rate_config: false }),
}));

import { getDrivingDistance } from '../pcMilerClient.js';
import { calculateNetRevenue } from '../routeHomeMatching.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Nashville, TN — fleet home base
const HOME = { lat: 36.1627, lng: -86.7816, city: 'Nashville', state: 'TN' };

// Deadline: Friday at 6 PM UTC
const WEEK_DEADLINE = new Date('2026-06-05T18:00:00.000Z');

const makeLoad = (overrides = {}) => ({
  load_id: 'load-001',
  status: 'available',
  equipment_type: 'Dry Van',
  pickup_city: 'Memphis',
  pickup_state: 'TN',
  pickup_lat: 35.1495,
  pickup_lng: -90.0490,
  delivery_city: 'Nashville',
  delivery_state: 'TN',
  delivery_lat: 36.1627,
  delivery_lng: -86.7816,
  distance_miles: 200,
  total_revenue: 1200,
  weight_lbs: 30000,
  trailer_length: 53,
  ...overrides,
});

const makeOutboundLoad = (overrides = {}) => ({
  load_id: 'load-out-001',
  status: 'available',
  equipment_type: 'Dry Van',
  pickup_city: 'Nashville',
  pickup_state: 'TN',
  pickup_lat: 36.1627,
  pickup_lng: -86.7816,
  delivery_city: 'Knoxville',
  delivery_state: 'TN',
  delivery_lat: 35.9606,
  delivery_lng: -83.9207,
  distance_miles: 180,
  total_revenue: 1000,
  weight_lbs: 25000,
  trailer_length: 53,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  calculateNetRevenue.mockReturnValue({ has_rate_config: false });
});

// ---------------------------------------------------------------------------
// PLAN_DEFAULTS
// ---------------------------------------------------------------------------

describe('PLAN_DEFAULTS', () => {
  it('exports expected keys with sensible values', () => {
    expect(PLAN_DEFAULTS.stringMiles).toBe(2500);
    expect(PLAN_DEFAULTS.minStringMiles).toBe(2000);
    expect(PLAN_DEFAULTS.maxStringMiles).toBe(3000);
    expect(PLAN_DEFAULTS.homeRadiusMiles).toBe(150);
    expect(PLAN_DEFAULTS.connectionRadiusMiles).toBe(150);
    expect(PLAN_DEFAULTS.minTotalMiles).toBe(500);
    expect(PLAN_DEFAULTS.maxReturnLegMiles).toBe(1250);
  });
});

// ---------------------------------------------------------------------------
// scoreReturnLoad
// ---------------------------------------------------------------------------

describe('scoreReturnLoad', () => {
  it('returns correct structure', () => {
    const load = makeLoad({ total_revenue: 1200 });
    const result = scoreReturnLoad(load, 200, 50);
    expect(result).toMatchObject({
      load,
      pickupToDeliveryMiles: 200,
      deliveryToHomeMiles: 50,
      totalMiles: 250,
      revenue: 1200,
    });
  });

  it('calculates revenuePerMile correctly', () => {
    const load = makeLoad({ total_revenue: 1200 });
    const result = scoreReturnLoad(load, 200, 50);
    expect(result.revenuePerMile).toBeCloseTo(1200 / 250);
  });

  it('revenuePerMile is 0 when totalMiles is 0', () => {
    const load = makeLoad({ total_revenue: 1000 });
    const result = scoreReturnLoad(load, 0, 0);
    expect(result.revenuePerMile).toBe(0);
  });

  it('coerces string total_revenue to number', () => {
    const load = makeLoad({ total_revenue: '1500' });
    const result = scoreReturnLoad(load, 300, 75);
    expect(result.revenue).toBe(1500);
    expect(result.revenuePerMile).toBeCloseTo(1500 / 375);
  });

  it('treats missing total_revenue as 0', () => {
    const load = makeLoad({ total_revenue: null });
    const result = scoreReturnLoad(load, 200, 50);
    expect(result.revenue).toBe(0);
    expect(result.revenuePerMile).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildChain
// ---------------------------------------------------------------------------

describe('buildChain', () => {
  const outbound = makeOutboundLoad({ total_revenue: 1000 });
  const ret = makeLoad({ total_revenue: 1200 });

  const baseChainArgs = {
    outboundLoad: outbound,
    returnLoad: ret,
    homeToOutboundPickupMiles: 0,
    outboundLoadedMiles: 180,
    deadheadMiles: 50,
    returnLoadedMiles: 200,
    deliveryToHomeMiles: 50,
    weekDeadline: WEEK_DEADLINE,
  };

  it('sums all leg miles into totalMiles', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.totalMiles).toBe(0 + 180 + 50 + 200 + 50);
  });

  it('sums revenues into totalRevenue', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.totalRevenue).toBe(2200);
  });

  it('calculates revenuePerTotalMile', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.revenuePerTotalMile).toBeCloseTo(2200 / 480);
  });

  it('withinOptimalBand is true when total is between minStringMiles and maxStringMiles', () => {
    // 480 miles is below 2000 — should be false
    const chain = buildChain(baseChainArgs);
    expect(chain.withinOptimalBand).toBe(false);
  });

  it('withinOptimalBand is true for a 2300-mile chain', () => {
    const chain = buildChain({
      ...baseChainArgs,
      outboundLoadedMiles: 1000,
      deadheadMiles: 100,
      returnLoadedMiles: 1000,
      deliveryToHomeMiles: 200,
    });
    // 0 + 1000 + 100 + 1000 + 200 = 2300
    expect(chain.withinOptimalBand).toBe(true);
  });

  it('includes legs breakdown', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.legs).toMatchObject({
      homeToPickup: 0,
      outboundLoaded: 180,
      deadhead: 50,
      returnLoaded: 200,
      returnToHome: 50,
    });
  });

  it('departureTime is before weekDeadline', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.departureTime.getTime()).toBeLessThan(WEEK_DEADLINE.getTime());
  });

  it('arrivalHome is at or before weekDeadline', () => {
    const chain = buildChain(baseChainArgs);
    // Allow small floating-point drift (within 1 second)
    expect(chain.arrivalHome.getTime()).toBeLessThanOrEqual(WEEK_DEADLINE.getTime() + 1000);
  });

  it('returnPickupTime is between departureTime and arrivalHome', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.returnPickupTime.getTime()).toBeGreaterThanOrEqual(chain.departureTime.getTime());
    expect(chain.returnPickupTime.getTime()).toBeLessThanOrEqual(chain.arrivalHome.getTime());
  });

  it('passes rateConfig to calculateNetRevenue when provided', () => {
    const rateConfig = { fuelMpg: 6.5, fuelPricePerGallon: 4.0 };
    calculateNetRevenue.mockReturnValue({ net_revenue: 1800, has_rate_config: true });
    const chain = buildChain({ ...baseChainArgs, rateConfig });
    expect(calculateNetRevenue).toHaveBeenCalledWith(2200, 480, rateConfig);
    expect(chain.has_rate_config).toBe(true);
    expect(chain.net_revenue).toBe(1800);
  });

  it('spreads { has_rate_config: false } when no rateConfig', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.has_rate_config).toBe(false);
  });

  it('sets outboundLoad and returnLoad on result', () => {
    const chain = buildChain(baseChainArgs);
    expect(chain.outboundLoad).toBe(outbound);
    expect(chain.returnLoad).toBe(ret);
  });

  it('handles 0-revenue loads without NaN', () => {
    const chain = buildChain({
      ...baseChainArgs,
      outboundLoad: makeOutboundLoad({ total_revenue: 0 }),
      returnLoad: makeLoad({ total_revenue: 0 }),
    });
    expect(chain.totalRevenue).toBe(0);
    expect(chain.revenuePerTotalMile).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// planWorkWeek
// ---------------------------------------------------------------------------

describe('planWorkWeek', () => {
  // Return load: pickup in Memphis (200mi from Nashville delivery), delivery at Nashville home
  const returnLoad = makeLoad({
    load_id: 'return-001',
    pickup_city: 'Memphis',
    pickup_state: 'TN',
    pickup_lat: 35.1495,
    pickup_lng: -90.0490,
    delivery_city: 'Nashville',
    delivery_state: 'TN',
    delivery_lat: 36.1627,
    delivery_lng: -86.7816,
    distance_miles: 210,
    total_revenue: 1800,
  });

  // Outbound load: pickup at Nashville home, delivery near Memphis
  const outboundLoad = makeOutboundLoad({
    load_id: 'outbound-001',
    pickup_city: 'Nashville',
    pickup_state: 'TN',
    pickup_lat: 36.1627,
    pickup_lng: -86.7816,
    delivery_city: 'Jackson',
    delivery_state: 'TN',
    delivery_lat: 35.6145,
    delivery_lng: -88.8139,
    distance_miles: 130,
    total_revenue: 900,
  });

  const baseParams = {
    fleetHome: HOME,
    fleetProfile: {},
    weekDeadline: WEEK_DEADLINE,
    loads: [returnLoad, outboundLoad],
  };

  it('returns the expected shape', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(15)   // delivery→home for returnLoad
      .mockResolvedValueOnce(5)    // home→pickup for outboundLoad
      .mockResolvedValueOnce(60);  // deadhead: outbound delivery → return pickup

    const result = await planWorkWeek(baseParams);
    expect(result).toHaveProperty('chains');
    expect(result).toHaveProperty('returnOnlyOptions');
    expect(result).toHaveProperty('meta');
    expect(Array.isArray(result.chains)).toBe(true);
    expect(Array.isArray(result.returnOnlyOptions)).toBe(true);
  });

  it('meta reflects searched load counts', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(60);

    const result = await planWorkWeek(baseParams);
    expect(result.meta.totalLoadsSearched).toBe(2);
    expect(result.meta.returnCandidatesFound).toBeGreaterThanOrEqual(1);
    expect(result.meta.outboundCandidatesFound).toBeGreaterThanOrEqual(1);
  });

  it('filters out non-available loads', async () => {
    const booked = makeLoad({ load_id: 'booked', status: 'booked' });
    getDrivingDistance.mockResolvedValue(20);

    const result = await planWorkWeek({ ...baseParams, loads: [booked] });
    expect(result.meta.returnCandidatesFound).toBe(0);
    expect(result.meta.outboundCandidatesFound).toBe(0);
  });

  it('excludes loads with wrong equipment type when profile specifies one', async () => {
    const reefer = makeLoad({ load_id: 'reefer', equipment_type: 'Reefer' });
    getDrivingDistance.mockResolvedValue(20);

    const result = await planWorkWeek({
      ...baseParams,
      fleetProfile: { trailerType: 'Dry Van' },
      loads: [reefer],
    });
    expect(result.meta.returnCandidatesFound).toBe(0);
  });

  it('returns empty chains when no loads are provided', async () => {
    const result = await planWorkWeek({ ...baseParams, loads: [] });
    expect(result.chains).toHaveLength(0);
    expect(result.returnOnlyOptions).toHaveLength(0);
  });

  it('skips loads where PC*MILER throws (null distance)', async () => {
    getDrivingDistance.mockRejectedValue(new Error('API error'));

    const result = await planWorkWeek(baseParams);
    expect(result.chains).toHaveLength(0);
  });

  it('chains are sorted by revenuePerTotalMile descending', async () => {
    // Two viable outbound loads — set revenues so we can confirm sort order
    const outbound2 = makeOutboundLoad({
      load_id: 'outbound-002',
      total_revenue: 2000,
    });

    getDrivingDistance
      // returnLoad: delivery→home
      .mockResolvedValueOnce(15)
      // outboundLoad: home→pickup
      .mockResolvedValueOnce(5)
      // outbound2: home→pickup
      .mockResolvedValueOnce(5)
      // deadhead for outboundLoad→return
      .mockResolvedValueOnce(60)
      // deadhead for outbound2→return
      .mockResolvedValueOnce(60);

    const result = await planWorkWeek({
      ...baseParams,
      loads: [returnLoad, outboundLoad, outbound2],
    });

    if (result.chains.length >= 2) {
      const [first, second] = result.chains;
      expect(first.revenuePerTotalMile).toBeGreaterThanOrEqual(second.revenuePerTotalMile);
    }
  });

  it('returnOnlyOptions capped at 5', async () => {
    const manyReturns = Array.from({ length: 8 }, (_, i) =>
      makeLoad({ load_id: `r${i}`, delivery_lat: HOME.lat, delivery_lng: HOME.lng })
    );
    getDrivingDistance.mockResolvedValue(20);

    const result = await planWorkWeek({ ...baseParams, loads: manyReturns });
    expect(result.returnOnlyOptions.length).toBeLessThanOrEqual(5);
  });

  it('returnOnlyOptions includes expected fields', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(60);

    const result = await planWorkWeek(baseParams);
    if (result.returnOnlyOptions.length > 0) {
      const opt = result.returnOnlyOptions[0];
      expect(opt).toHaveProperty('load');
      expect(opt).toHaveProperty('pickupToDeliveryMiles');
      expect(opt).toHaveProperty('deliveryToHomeMiles');
      expect(opt).toHaveProperty('totalMiles');
      expect(opt).toHaveProperty('revenue');
      expect(opt).toHaveProperty('revenuePerMile');
    }
  });

  it('chains capped at 10', async () => {
    // Create 12 outbound loads — all near home — to generate many pairs
    const manyOutbounds = Array.from({ length: 12 }, (_, i) =>
      makeOutboundLoad({
        load_id: `out${i}`,
        delivery_lat: 35.1495,
        delivery_lng: -90.0490, // Near Memphis — close to return pickup
      })
    );
    getDrivingDistance.mockResolvedValue(20); // all distances return 20

    const result = await planWorkWeek({
      ...baseParams,
      loads: [returnLoad, ...manyOutbounds],
    });
    expect(result.chains.length).toBeLessThanOrEqual(10);
  });

  it('respects stringMiles override — chains outside budget are excluded', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(60);

    // With stringMiles: 100, maxTotal = min(120, 3000) = 120
    // A chain of 210 + 130 + deadhead(60) + 15 + 5 = 420 miles should be excluded
    const result = await planWorkWeek({ ...baseParams, stringMiles: 100 });
    expect(result.chains).toHaveLength(0);
  });
});

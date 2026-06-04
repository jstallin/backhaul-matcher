import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDistance,
  calculateNetRevenue,
  findRouteHomeBackhauls,
  clearDistanceCache,
  evaluatePickupDateFit,
  effectivePickupDate,
  computeNegotiation,
  netCreditAtGross,
  routeChargesOf,
  isNoRateLoad,
  NEGOTIATION_TARGET_MARGIN,
} from '../routeHomeMatching.js';

// Mock external dependencies so tests are self-contained and don't hit APIs
vi.mock('../routeCorridorService.js', () => ({
  getRouteWithCorridor: vi.fn().mockResolvedValue(null), // Forces Haversine fallback
  isPointInCorridor: vi.fn().mockReturnValue(true),
}));

vi.mock('../pcMilerClient.js', () => ({
  getDrivingDistance: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  db: {
    distanceCache: {
      getBatch: vi.fn().mockResolvedValue([]),       // No DB hits — fall through to PC*MILER
      upsertBatch: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { getDrivingDistance } from '../pcMilerClient.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Stockton GA → Hollywood FL — Chip's real-world test case
const STOCKTON_GA   = { lat: 30.9393, lng: -82.9995 };
const HOLLYWOOD_FL  = { lat: 26.0206, lng: -80.1529 };

// Base load: Valdosta GA pickup → Jacksonville FL delivery — solidly in-corridor
const makeLoad = (overrides = {}) => ({
  load_id: 'load-001',
  source: 'directfreight',
  status: 'available',
  equipment_type: 'Dry Van',
  pickup_city: 'Valdosta',
  pickup_state: 'GA',
  pickup_lat: 30.8327,
  pickup_lng: -83.2785,
  delivery_city: 'Jacksonville',
  delivery_state: 'FL',
  delivery_lat: 30.3322,
  delivery_lng: -81.6557,
  distance_miles: 115,
  total_revenue: 1200,
  pay_rate: 1200,
  rate_per_mile: 0,
  weight_lbs: 30000,
  trailer_length: 53,
  full_load: true,
  age_minutes: 10,
  ...overrides,
});

const DRY_VAN_FLEET = {
  trailerType: 'Dry Van',
  trailerLength: 53,
  weightLimit: 45000,
};

const RATE_CONFIG = {
  revenueSplitCarrier: 20,   // carrier gets 20%, customer gets 80%
  mileageRate: 1.50,          // $1.50/OOR mile
  stopRate: 50,               // $50/stop, 2 stops
  fuelPeg: 3.00,              // PEG at $3.00/gal
  fuelMpg: 6,                 // 6 MPG
  doePaddRate: 4.50,          // DOE PADD at $4.50/gal
  otherCharge1Amount: 0,
  otherCharge2Amount: 0,
};

// ---------------------------------------------------------------------------
// calculateDistance
// ---------------------------------------------------------------------------

describe('calculateDistance', () => {
  it('returns 0 for identical points', () => {
    expect(calculateDistance(30.9, -83.0, 30.9, -83.0)).toBe(0);
  });

  it('Stockton GA → Hollywood FL is roughly 490–540 road miles (Haversine)', () => {
    const miles = calculateDistance(
      STOCKTON_GA.lat, STOCKTON_GA.lng,
      HOLLYWOOD_FL.lat, HOLLYWOOD_FL.lng
    );
    expect(miles).toBeGreaterThan(490);
    expect(miles).toBeLessThan(540);
  });

  it('is symmetric — same distance both directions', () => {
    const ab = calculateDistance(30.9, -83.0, 26.0, -80.2);
    const ba = calculateDistance(26.0, -80.2, 30.9, -83.0);
    expect(Math.abs(ab - ba)).toBeLessThan(0.01);
  });

  it('Atlanta to Miami is farther than Atlanta to Jacksonville', () => {
    const atlantaToJax   = calculateDistance(33.749, -84.388, 30.332, -81.656);
    const atlantaToMiami = calculateDistance(33.749, -84.388, 25.775, -80.208);
    expect(atlantaToMiami).toBeGreaterThan(atlantaToJax);
  });
});

// ---------------------------------------------------------------------------
// calculateNetRevenue
// ---------------------------------------------------------------------------

describe('calculateNetRevenue', () => {
  it('splits revenue correctly between carrier and customer', () => {
    // $2000 revenue, 20% carrier split
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.carrier_revenue).toBeCloseTo(400);   // 20% of $2000
    expect(result.customer_share).toBeCloseTo(1600);   // 80% of $2000
  });

  it('calculates FSC per mile correctly', () => {
    // FSC = (DOE - PEG) / MPG = (4.50 - 3.00) / 6 = $0.25/mile
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.fsc_per_mile).toBeCloseTo(0.25);
  });

  it('calculates mileage expense correctly', () => {
    // 100 OOR miles × $1.50/mile = $150
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.mileage_expense).toBeCloseTo(150);
  });

  it('calculates stop expense correctly', () => {
    // 2 stops × $50/stop = $100
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.stop_expense).toBeCloseTo(100);
    expect(result.stop_count).toBe(2);
  });

  it('calculates fuel surcharge correctly', () => {
    // 100 OOR miles × $0.25/mile FSC = $25
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.fuel_surcharge).toBeCloseTo(25);
  });

  it('calculates customer net credit correctly (end-to-end)', () => {
    // customer_share - mileage - stops - fuel_surcharge
    // $1600 - $150 - $100 - $25 = $1325
    const result = calculateNetRevenue(2000, 100, RATE_CONFIG);
    expect(result.customer_net_credit).toBeCloseTo(1325);
  });

  it('includes other charges in customer net credit deduction', () => {
    const config = { ...RATE_CONFIG, otherCharge1Amount: 75, otherCharge2Amount: 25 };
    // $1600 - $150 - $100 - $25 - $100 = $1225
    const result = calculateNetRevenue(2000, 100, config);
    expect(result.other_charges).toBeCloseTo(100);
    expect(result.customer_net_credit).toBeCloseTo(1225);
  });

  it('skips FSC when DOE rate is zero', () => {
    const config = { ...RATE_CONFIG, doePaddRate: 0 };
    const result = calculateNetRevenue(2000, 100, config);
    expect(result.fsc_per_mile).toBe(0);
    expect(result.fuel_surcharge).toBe(0);
  });

  it('handles zero revenue gracefully', () => {
    const result = calculateNetRevenue(0, 100, RATE_CONFIG);
    expect(result.carrier_revenue).toBe(0);
    expect(result.customer_share).toBe(0);
    expect(result.customer_net_credit).toBeLessThan(0); // expenses still apply
  });

  it('handles zero additional miles (load perfectly on route)', () => {
    const result = calculateNetRevenue(1500, 0, RATE_CONFIG);
    expect(result.mileage_expense).toBe(0);
    expect(result.fuel_surcharge).toBe(0);
    // 80% of $1500 = $1200, minus 2 stops × $50 = $1100
    expect(result.customer_net_credit).toBeCloseTo(1100);
  });

  it('handles string revenue and miles input (coerces to number)', () => {
    const result = calculateNetRevenue('1000', '50', RATE_CONFIG);
    expect(result.carrier_revenue).toBeCloseTo(200);
  });

  it('handles null/undefined revenue as 0', () => {
    const result = calculateNetRevenue(null, undefined, RATE_CONFIG);
    expect(result.carrier_revenue).toBe(0);
    expect(result.customer_share).toBe(0);
  });

  it('treats negative additional miles as 0', () => {
    const result = calculateNetRevenue(1000, -50, RATE_CONFIG);
    expect(result.mileage_expense).toBe(0);
    expect(result.fuel_surcharge).toBe(0);
  });

  it('defaults fuelMpg to 6 when undefined', () => {
    const config = { ...RATE_CONFIG, fuelMpg: undefined };
    const result = calculateNetRevenue(1000, 100, config);
    // FSC = (4.50 - 3.00) / 6 = 0.25
    expect(result.fsc_per_mile).toBeCloseTo(0.25);
  });

  it('defaults carrier split to 20% when revenueSplitCarrier is undefined', () => {
    const config = { ...RATE_CONFIG, revenueSplitCarrier: undefined };
    const result = calculateNetRevenue(1000, 0, config);
    expect(result.carrier_revenue).toBeCloseTo(200);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — equipment filtering
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — equipment filter', () => {
  beforeEach(() => {
    clearDistanceCache();
    getDrivingDistance.mockResolvedValue(null); // PC*MILER unavailable
  });

  it('includes a matching Dry Van load for a Dry Van fleet', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ equipment_type: 'Dry Van' })]
    );
    expect(opportunities).toHaveLength(1);
  });

  it('excludes a Flatbed load for a Dry Van fleet (hard equipment filter)', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ equipment_type: 'Flatbed' })]
    );
    expect(opportunities).toHaveLength(0);
  });

  it('excludes mismatched loads and returns only type-matched loads', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [
        makeLoad({ load_id: 'mismatch', equipment_type: 'Flatbed', total_revenue: 9999 }),
        makeLoad({ load_id: 'match',    equipment_type: 'Dry Van',  total_revenue: 100  }),
      ]
    );
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].load_id).toBe('match');
    expect(opportunities[0].trailer_type_match).toBe(true);
  });

  it('rejects a load over the weight limit', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ weight_lbs: 50000 })] // over 45000 lb limit
    );
    expect(opportunities).toHaveLength(0);
  });

  it('rejects a load with a trailer longer than fleet allows', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, { ...DRY_VAN_FLEET, trailerLength: 48 },
      [makeLoad({ trailer_length: 53 })]
    );
    expect(opportunities).toHaveLength(0);
  });

  it('passes a load when fleet has no equipment type restriction', async () => {
    const fleet = { trailerLength: 53, weightLimit: 45000 }; // no trailerType
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, fleet,
      [makeLoad({ equipment_type: 'Flatbed' })]
    );
    expect(opportunities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — corridor filtering (Haversine, no PC*MILER)
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — corridor filter', () => {
  beforeEach(() => {
    clearDistanceCache();
    getDrivingDistance.mockResolvedValue(null);
  });

  it('includes a load with pickup squarely in-corridor (Valdosta GA → Jacksonville FL)', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad()] // Valdosta GA (30.83N) is between Stockton GA (30.94N) and Hollywood FL (26.02N)
    );
    expect(opportunities).toHaveLength(1);
  });

  it('rejects a load with pickup way off-corridor (Illinois centroid on GA→FL route)', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-il',
        pickup_lat: null, pickup_lng: null,
        pickup_state: 'IL',   // centroid ~40.0N,-89.2W — far northwest of corridor
        delivery_lat: null, delivery_lng: null,
        delivery_state: 'FL',
      })]
    );
    expect(opportunities).toHaveLength(0);
  });

  it('includes a load with null coords when state centroids are in-corridor', async () => {
    // FL centroid (27.8, -81.7) is between Stockton GA (30.94N) and Hollywood FL (26.02N).
    // With centroid fallback, firstLeg ≈ 311 mi and deliveryToHome ≈ 209 mi (Haversine).
    // distance_miles kept short (50) so additionalMiles ≈ 55 stays under the 100-mile cap.
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-fl-null',
        pickup_lat: null, pickup_lng: null, pickup_state: 'FL',
        delivery_lat: null, delivery_lng: null, delivery_state: 'FL',
        distance_miles: 50,
      })]
    );
    expect(opportunities).toHaveLength(1);
  });

  it('excludes loads with status other than available', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ status: 'cancelled' })]
    );
    expect(opportunities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — same-city search (datum == home, local round-trip)
// Regression for the centroid filter collapsing when datum == home: with
// datum == home the datum→home distance is ~0, so the old
// `centroidToHome > haversineDirect` test rejected every coordless live load
// (Truckstop loads have no pickup/delivery coords). The threshold is now floored
// with homeRadiusMiles. Uses the production same-city params (radius 200 / corridor 300).
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — same-city search (datum == home)', () => {
  // Atlanta GA — the datum and fleet home are the same city.
  const ATLANTA = { lat: 33.749, lng: -84.388 };

  beforeEach(() => {
    clearDistanceCache();
    getDrivingDistance.mockResolvedValue(null); // PC*MILER unavailable → Haversine + centroid fallback
  });

  it('keeps a coordless load delivering to a nearby state (GA centroid within home radius)', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      ATLANTA, ATLANTA, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-ts-ga',
        pickup_lat: null, pickup_lng: null, pickup_state: 'GA',
        delivery_lat: null, delivery_lng: null, delivery_state: 'GA',
        distance_miles: 50,
      })],
      200,  // homeRadiusMiles — same-city production value
      300   // corridorWidthMiles — same-city production value
    );
    expect(opportunities).toHaveLength(1);
  });

  it('still rejects a coordless load delivering to a far state (CA centroid beyond home radius)', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      ATLANTA, ATLANTA, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-ts-ca',
        pickup_lat: null, pickup_lng: null, pickup_state: 'GA',
        delivery_lat: null, delivery_lng: null, delivery_state: 'CA',
        distance_miles: 50,
      })],
      200,
      300
    );
    expect(opportunities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — scoring math (with mocked PC*MILER distances)
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — scoring math', () => {
  beforeEach(() => {
    clearDistanceCache();
  });

  it('uses PC*MILER distances when available and reports them correctly', async () => {
    // datum→pickup=100, pickup→delivery=200, delivery→home=150
    getDrivingDistance
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(150);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ total_revenue: 1500 })]
    );
    expect(opportunities).toHaveLength(1);
    const opp = opportunities[0];
    expect(opp.datum_to_pickup_miles).toBe(100);
    expect(opp.pickup_to_delivery_miles).toBe(200);
    expect(opp.delivery_to_home_miles).toBe(150);
    expect(opp.distance_source).toBe('pcmiler');
  });

  it('calculates revenue per mile correctly', async () => {
    // 100 + 200 + 150 = 450 total miles, $1800 revenue → $4.00/mile
    getDrivingDistance
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(150);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ total_revenue: 1800 })]
    );
    expect(opportunities[0].revenue_per_mile).toBeCloseTo(1800 / 450, 2);
  });

  it('rejects a load where delivery drops driver farther from home than datum', async () => {
    // delivery→home = 600 miles, directReturn ≈ 515 miles → moving backward
    getDrivingDistance
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(600);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ load_id: 'load-backward' })]
    );
    expect(opportunities).toHaveLength(0);
  });

  it('rejects a load with a leg below the 5-mile minimum', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(3)    // datum→pickup: 3 miles — below minimum
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(150);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ load_id: 'load-tiny' })]
    );
    expect(opportunities).toHaveLength(0);
  });

  it('includes a load with null coords when state centroid fallback provides in-corridor Haversine distances', async () => {
    // With centroid fallback, null pickup/delivery coords resolve to the FL centroid (27.8, -81.7).
    // PC*MILER returns null, so all three legs fall back to Haversine.
    // firstLeg ≈ 311 mi, pickupToDelivery = distance_miles = 50, deliveryToHome ≈ 209 mi.
    // additionalMiles ≈ 55 — under the 100-mile cap, so the load is included.
    getDrivingDistance.mockResolvedValue(null);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-no-coords',
        pickup_lat: null, pickup_lng: null, pickup_state: 'FL',
        delivery_lat: null, delivery_lng: null, delivery_state: 'FL',
        distance_miles: 50,
      })]
    );
    expect(opportunities).toHaveLength(1);
  });

  it('returns empty array when loads list is empty', async () => {
    getDrivingDistance.mockResolvedValue(null);
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET, []
    );
    expect(opportunities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — relay mode
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — relay mode', () => {
  beforeEach(() => {
    clearDistanceCache();
  });

  it('relay additional miles equals the full relay driver loop (home→pickup→delivery→home)', async () => {
    // Chip's formula: additional = home→pickup + pickup→delivery + delivery→home
    getDrivingDistance
      .mockResolvedValueOnce(100)  // home→pickup
      .mockResolvedValueOnce(200)  // pickup→delivery
      .mockResolvedValueOnce(100); // delivery→home

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ load_id: 'load-relay' })],
      50, 50, null,
      true // isRelay = true
    );
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].additional_miles).toBe(400); // 100+200+100
  });

  it('relay total miles = direct datum→home + full relay loop', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(100);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ load_id: 'load-relay-total' })],
      50, 50, null, true
    );
    const opp = opportunities[0];
    // total = directReturn (Haversine ~515) + relayLoop (400)
    expect(opp.total_miles).toBe(opp.direct_return_miles + 400);
  });
});

// ---------------------------------------------------------------------------
// findRouteHomeBackhauls — net revenue integration
// ---------------------------------------------------------------------------

describe('findRouteHomeBackhauls — net revenue with rate config', () => {
  beforeEach(() => {
    clearDistanceCache();
  });

  it('attaches net revenue fields when rate config is provided', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(100);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ total_revenue: 2000 })],
      50, 50, RATE_CONFIG
    );
    const opp = opportunities[0];
    expect(opp.has_rate_config).toBe(true);
    expect(opp.carrier_revenue).toBeCloseTo(400);  // 20% of $2000
    expect(opp.customer_share).toBeCloseTo(1600);  // 80% of $2000
    expect(opp.customer_net_credit).toBeDefined();
  });

  it('omits rate config fields when no rate config is passed', async () => {
    getDrivingDistance
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(100);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ load_id: 'load-no-rate', total_revenue: 2000 })]
    );
    expect(opportunities[0].has_rate_config).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluatePickupDateFit — pure date-window logic
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluatePickupDateFit', () => {
  it('flags exact same-day match', () => {
    const r = evaluatePickupDateFit('2026-06-01', '2026-06-01');
    expect(r).toEqual({ withinWindow: true, fit: 'exact', offsetDays: 0 });
  });

  it('flags a load one day late as within window', () => {
    const r = evaluatePickupDateFit('2026-06-02', '2026-06-01');
    expect(r).toEqual({ withinWindow: true, fit: 'late', offsetDays: 1 });
  });

  it('flags a load one day early as within window', () => {
    const r = evaluatePickupDateFit('2026-05-31', '2026-06-01');
    expect(r).toEqual({ withinWindow: true, fit: 'early', offsetDays: -1 });
  });

  it('rejects loads more than one day outside the window', () => {
    expect(evaluatePickupDateFit('2026-06-03', '2026-06-01').withinWindow).toBe(false);
    expect(evaluatePickupDateFit('2026-05-29', '2026-06-01').withinWindow).toBe(false);
  });

  it('keeps loads unflagged when there is no requested date or no load date', () => {
    expect(evaluatePickupDateFit('2026-06-01', null)).toEqual({ withinWindow: true, fit: null, offsetDays: null });
    expect(evaluatePickupDateFit(null, '2026-06-01')).toEqual({ withinWindow: true, fit: null, offsetDays: null });
  });

  it('tolerates ISO timestamps by comparing the date portion', () => {
    const r = evaluatePickupDateFit('2026-06-01T14:00:00', '2026-06-01');
    expect(r.fit).toBe('exact');
  });
});

describe('effectivePickupDate', () => {
  const today = new Date(2026, 4, 30); // May 30, 2026 (month is 0-indexed)

  it('keeps a future date as-is', () => {
    expect(effectivePickupDate('2026-06-15', today)).toBe('2026-06-15');
  });

  it("keeps today's date", () => {
    expect(effectivePickupDate('2026-05-30', today)).toBe('2026-05-30');
  });

  it('clamps a past date up to today', () => {
    expect(effectivePickupDate('2026-05-01', today)).toBe('2026-05-30');
  });

  it('returns today for null/empty', () => {
    expect(effectivePickupDate('', today)).toBe('2026-05-30');
    expect(effectivePickupDate(null, today)).toBe('2026-05-30');
  });

  it('handles ISO timestamps by date portion', () => {
    expect(effectivePickupDate('2026-05-01T08:00:00', today)).toBe('2026-05-30');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findRouteHomeBackhauls — pickup-date hard filter (item 004)
// ─────────────────────────────────────────────────────────────────────────────

describe('findRouteHomeBackhauls — pickup-date filter', () => {
  beforeEach(() => clearDistanceCache());

  it('drops loads outside the ±1 day window and tags the survivors', async () => {
    const loads = [
      makeLoad({ load_id: 'on-date',  pickup_date: '2026-06-01' }),
      makeLoad({ load_id: 'next-day', pickup_date: '2026-06-02' }),
      makeLoad({ load_id: 'too-late', pickup_date: '2026-06-05' }),
    ];
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET, loads,
      50, 50, null, false, '2026-06-01'
    );
    const ids = opportunities.map(o => o.load_id);
    expect(ids).toContain('on-date');
    expect(ids).toContain('next-day');
    expect(ids).not.toContain('too-late');
    expect(opportunities.find(o => o.load_id === 'on-date').date_fit.fit).toBe('exact');
    expect(opportunities.find(o => o.load_id === 'next-day').date_fit.fit).toBe('late');
  });

  it('applies no date filter when no requested date is passed (back-compat)', async () => {
    const loads = [makeLoad({ load_id: 'far-out', pickup_date: '2026-12-25' })];
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET, loads
    );
    expect(opportunities.map(o => o.load_id)).toContain('far-out');
    expect(opportunities[0].date_fit.fit).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Negotiation helper (item 005) — deterministic, hand-verifiable
// ─────────────────────────────────────────────────────────────────────────────

describe('negotiation helper', () => {
  // Mirrors the Watco $0 screenshot: only a $130 stop charge, 80/20 customer/carrier.
  const zeroRateMatch = {
    has_rate_config: true,
    customer_pct: 0.80,
    mileage_expense: 0,
    stop_expense: 130,
    fuel_surcharge: 0,
    other_charges: 0,
    total_revenue: 0,
  };

  it('isNoRateLoad detects $0 / missing rate', () => {
    expect(isNoRateLoad({ total_revenue: 0 })).toBe(true);
    expect(isNoRateLoad({ totalRevenue: 1500 })).toBe(false);
    expect(isNoRateLoad({})).toBe(true);
  });

  it('routeChargesOf sums the four expense components', () => {
    expect(routeChargesOf({ mileage_expense: 100, stop_expense: 130, fuel_surcharge: 20, other_charges: 50 })).toBe(300);
  });

  it('breakeven gross clears route charges at the customer split', () => {
    const n = computeNegotiation(zeroRateMatch);
    // 130 / 0.80 = 162.50
    expect(n.breakevenGross).toBeCloseTo(162.5, 2);
    // net credit is exactly zero at breakeven
    expect(netCreditAtGross(n.breakevenGross, n.routeCharges, n.customerPct)).toBeCloseTo(0, 6);
  });

  it('target gross sits a margin above breakeven', () => {
    const n = computeNegotiation(zeroRateMatch);
    expect(n.margin).toBe(NEGOTIATION_TARGET_MARGIN);
    expect(n.targetGross).toBeCloseTo(162.5 * (1 + NEGOTIATION_TARGET_MARGIN), 2);
    expect(n.targetGross).toBeGreaterThan(n.breakevenGross);
  });

  it('returns null without rate config or a usable split', () => {
    expect(computeNegotiation({ has_rate_config: false })).toBeNull();
    expect(computeNegotiation({ has_rate_config: true, customer_pct: 0 })).toBeNull();
    expect(computeNegotiation(null)).toBeNull();
  });

  it('netCreditAtGross is linear in gross', () => {
    // 80% of 1000 minus 130 charges = 670
    expect(netCreditAtGross(1000, 130, 0.80)).toBeCloseTo(670, 6);
  });
});

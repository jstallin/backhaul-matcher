import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDistance,
  calculateNetRevenue,
  findRouteHomeBackhauls,
  clearDistanceCache,
} from '../routeHomeMatching.js';

// Mock external dependencies so tests are self-contained and don't hit APIs
vi.mock('../routeCorridorService.js', () => ({
  getRouteWithCorridor: vi.fn().mockResolvedValue(null), // Forces Haversine fallback
  isPointInCorridor: vi.fn().mockReturnValue(true),
}));

vi.mock('../pcMilerClient.js', () => ({
  getDrivingDistance: vi.fn(),
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

  it('rejects a Flatbed load for a Dry Van fleet', async () => {
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({ equipment_type: 'Flatbed' })]
    );
    expect(opportunities).toHaveLength(0);
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
    // FL centroid (27.8, -81.7) is between Stockton GA (30.94N) and Hollywood FL (26.02N)
    // Note: GA centroid (32.7N) is NORTH of datum so it fails corridor — use FL for pickup
    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-fl-null',
        pickup_lat: null, pickup_lng: null, pickup_state: 'FL',
        delivery_lat: null, delivery_lng: null, delivery_state: 'FL',
        distance_miles: 200,
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

  it('does NOT reject a load when firstLeg is null — the null-coercion bug regression', async () => {
    // Regression: null < 5 === true in JS because null coerces to 0.
    // A load with no coords + no PC*MILER must not be silently dropped.
    getDrivingDistance.mockResolvedValue(null);

    const { opportunities } = await findRouteHomeBackhauls(
      STOCKTON_GA, HOLLYWOOD_FL, DRY_VAN_FLEET,
      [makeLoad({
        load_id: 'load-no-coords',
        pickup_lat: null, pickup_lng: null, pickup_state: 'FL',
        delivery_lat: null, delivery_lng: null, delivery_state: 'FL',
        distance_miles: 200,
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

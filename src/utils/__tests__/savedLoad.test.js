import { describe, it, expect } from 'vitest';
import { buildSavedLoadRow, savedKeyOf } from '../savedLoad';

// #163: the saved-load mapper must translate the live (camelCase, nested) match object into
// the snake_case saved_loads row, coercing numbers/dates safely.

const match = {
  load_id: '12345', source: 'truckstop',
  origin: { city: 'Cleveland', state: 'OH', lat: 41.5, lng: -81.69 },
  destination: { city: 'Charlotte', state: 'NC', lat: 35.22, lng: -80.84 },
  pickupDate: '2026-06-20', deliveryDate: '2026-06-21',
  distance: 430.7, additionalMiles: 88.2,
  totalRevenue: 1850, customer_net_credit: 933.4,
  equipmentType: 'Dry Van', weight: 42000, trailerLength: 53,
  broker: 'Acme Logistics', shipper: 'BigCo', freightType: 'Dry',
  contactPhone: '9805551234', companyEmail: 'broker@acme.com',
};

describe('savedKeyOf', () => {
  it('keys by source::load_id', () => {
    expect(savedKeyOf(match)).toBe('truckstop::12345');
  });
  it('falls back to source_load_id and returns null without an id', () => {
    expect(savedKeyOf({ source: 'directfreight', source_load_id: 'X9' })).toBe('directfreight::X9');
    expect(savedKeyOf({ source: 'truckstop' })).toBeNull();
  });
});

describe('buildSavedLoadRow', () => {
  it('maps match → snake_case row with context + coercions', () => {
    const row = buildSavedLoadRow(match, { userId: 'u1', requestId: 'r1', fleetId: 'f1' });
    expect(row).toMatchObject({
      user_id: 'u1', request_id: 'r1', fleet_id: 'f1',
      load_id: '12345', source: 'truckstop',
      origin_city: 'Cleveland', origin_state: 'OH', origin_lat: 41.5, origin_lng: -81.69,
      destination_city: 'Charlotte', destination_state: 'NC',
      pickup_date: '2026-06-20', delivery_date: '2026-06-21',
      distance_miles: 431, out_of_route_miles: 88,
      revenue_amount: 1850, net_revenue: 933.4,
      equipment_type: 'Dry Van', weight_lbs: 42000, length_ft: 53,
      company_name: 'Acme Logistics', shipper: 'BigCo', freight_type: 'Dry',
      contact_phone: '9805551234', contact_email: 'broker@acme.com',
      status: 'saved',
    });
    expect(row.raw_data).toBe(match);
  });

  it('returns null without a match or userId', () => {
    expect(buildSavedLoadRow(null, { userId: 'u1' })).toBeNull();
    expect(buildSavedLoadRow(match, {})).toBeNull();
  });

  it('coerces bad numbers/dates to null and keeps unknown source', () => {
    const row = buildSavedLoadRow({ load_id: '1', pickupDate: 'not-a-date', distance: 'NaN' }, { userId: 'u1' });
    expect(row.source).toBe('unknown');
    expect(row.pickup_date).toBeNull();
    expect(row.distance_miles).toBeNull();
  });
});

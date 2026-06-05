import { describe, it, expect } from 'vitest';
import { buildDeclineSnapshot, OPERATIONS_DECLINED } from '../declineSnapshot.js';

const topMatch = {
  origin: { address: 'Atlanta, GA' },
  destination: { address: 'Greensboro, NC' },
  totalRevenue: 1250,
  has_rate_config: true,
  customer_net_credit: 741,
  carrier_revenue: 375,
};

describe('buildDeclineSnapshot', () => {
  it('snapshots gross, nets, and load summary for operations_declined', () => {
    expect(buildDeclineSnapshot(OPERATIONS_DECLINED, topMatch)).toEqual({
      declined_top_gross_revenue: 1250,
      declined_top_customer_net: 741,
      declined_top_carrier_net: 375,
      declined_top_load_summary: 'Atlanta, GA → Greensboro, NC',
    });
  });

  it('returns {} for other reasons', () => {
    expect(buildDeclineSnapshot('weather', topMatch)).toEqual({});
  });

  it('returns {} when no top match is displayed (decision #1)', () => {
    expect(buildDeclineSnapshot(OPERATIONS_DECLINED, null)).toEqual({});
    expect(buildDeclineSnapshot(OPERATIONS_DECLINED, undefined)).toEqual({});
  });

  it('nulls the nets without rate config but keeps gross (decision #2)', () => {
    const s = buildDeclineSnapshot(OPERATIONS_DECLINED, { ...topMatch, has_rate_config: false });
    expect(s.declined_top_gross_revenue).toBe(1250);
    expect(s.declined_top_customer_net).toBeNull();
    expect(s.declined_top_carrier_net).toBeNull();
  });

  it('uses carrier_revenue as-is for carrier net (decision #3)', () => {
    const s = buildDeclineSnapshot(OPERATIONS_DECLINED, topMatch);
    expect(s.declined_top_carrier_net).toBe(topMatch.carrier_revenue);
  });

  it('coerces NaN/invalid numbers to null', () => {
    const s = buildDeclineSnapshot(OPERATIONS_DECLINED, { ...topMatch, totalRevenue: NaN, customer_net_credit: 'abc' });
    expect(s.declined_top_gross_revenue).toBeNull();
    expect(s.declined_top_customer_net).toBeNull();
  });

  it('falls back to snake_case fields and city/state parts', () => {
    const s = buildDeclineSnapshot(OPERATIONS_DECLINED, {
      pickup_city: 'Memphis', pickup_state: 'TN',
      delivery_city: 'Nashville', delivery_state: 'TN',
      total_revenue: 980,
      has_rate_config: false,
    });
    expect(s.declined_top_gross_revenue).toBe(980);
    expect(s.declined_top_load_summary).toBe('Memphis, TN → Nashville, TN');
  });
});

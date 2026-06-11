import { describe, it, expect } from 'vitest';
import { normalizeTsLoad } from '../_lib/truckstop.js';

// Guards #146: Truckstop encodes "call for rate" as a 9,999,999,999 PaymentAmount
// sentinel and "unspecified length" as 9999. Left raw, the rate sentinel produces a
// fabricated multi-billion-dollar net that ranks #1; mapped to 0 it flows into the
// existing Call-for-Rate / Negotiate path (isNoRateLoad treats <= 0 as no rate).
describe('normalizeTsLoad — Truckstop sentinels', () => {
  const base = {
    ID: '1', OriginCity: 'Warren', OriginState: 'OH',
    DestinationCity: 'Winchester', DestinationState: 'VA', Mileage: '287',
  };

  it('maps the 9,999,999,999 "call for rate" rate sentinel to 0', () => {
    const load = normalizeTsLoad({ ...base, PaymentAmount: '9999999999' });
    expect(load.total_revenue).toBe(0);   // → isNoRateLoad === true → Call for rate
    expect(load.revenue_per_mile).toBe(0);
  });

  it('maps the 9999 "unspecified length" sentinel to null', () => {
    const load = normalizeTsLoad({ ...base, Length: '9999' });
    expect(load.trailer_length).toBeNull();
  });

  it('passes a real posted rate and length through untouched', () => {
    const load = normalizeTsLoad({ ...base, PaymentAmount: '238', Length: '53' });
    expect(load.total_revenue).toBe(238);
    expect(load.trailer_length).toBe(53);
    expect(load.revenue_per_mile).toBeGreaterThan(0);
  });
});

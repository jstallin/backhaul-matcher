import { describe, it, expect, vi, afterEach } from 'vitest';
import { isRequestExpired } from '../requestExpiry.js';

const isoDaysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
};

afterEach(() => vi.useRealTimers());

describe('isRequestExpired', () => {
  it('expired when end pickup window is before today', () => {
    expect(isRequestExpired({ equipment_needed_date: isoDaysFromNow(-1) })).toBe(true);
    expect(isRequestExpired({ equipment_needed_date: '2020-01-01' })).toBe(true);
  });

  it('not expired when end date is today (window includes today)', () => {
    expect(isRequestExpired({ equipment_needed_date: isoDaysFromNow(0) })).toBe(false);
  });

  it('not expired when end date is in the future', () => {
    expect(isRequestExpired({ equipment_needed_date: isoDaysFromNow(7) })).toBe(false);
  });

  it('never expires without an end date (open-ended window)', () => {
    expect(isRequestExpired({ equipment_needed_date: null })).toBe(false);
    expect(isRequestExpired({ equipment_needed_date: '' })).toBe(false);
    expect(isRequestExpired({})).toBe(false);
    expect(isRequestExpired(null)).toBe(false);
  });

  it('handles timestamp-style values by comparing the date part only', () => {
    expect(isRequestExpired({ equipment_needed_date: '2020-01-01T00:00:00+00:00' })).toBe(true);
    expect(isRequestExpired({ equipment_needed_date: `${isoDaysFromNow(3)}T05:00:00Z` })).toBe(false);
  });
});

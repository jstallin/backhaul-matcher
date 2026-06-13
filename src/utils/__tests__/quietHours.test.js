import { describe, it, expect } from 'vitest';
import { usTimeZoneFromCoords, isWithinNotifyWindow, DEFAULT_TZ } from '../quietHours.js';

describe('usTimeZoneFromCoords', () => {
  it('maps US longitudes to coarse continental zones', () => {
    expect(usTimeZoneFromCoords(-80.84, 35.22)).toBe('America/New_York');     // Charlotte
    expect(usTimeZoneFromCoords(-87.63, 41.88)).toBe('America/Chicago');      // Chicago
    expect(usTimeZoneFromCoords(-104.99, 39.74)).toBe('America/Denver');      // Denver
    expect(usTimeZoneFromCoords(-118.24, 34.05)).toBe('America/Los_Angeles'); // Los Angeles
  });

  it('falls back to Eastern when coords are missing/invalid', () => {
    expect(usTimeZoneFromCoords(null, null)).toBe(DEFAULT_TZ);
    expect(usTimeZoneFromCoords(undefined, undefined)).toBe(DEFAULT_TZ);
    expect(usTimeZoneFromCoords('not-a-number', 35)).toBe(DEFAULT_TZ);
  });
});

describe('isWithinNotifyWindow (8 AM–9 PM local, DST-correct for June 2026)', () => {
  it('suppresses a 2:30 AM Eastern alert (the reported case)', () => {
    // 06:30 UTC = 02:30 EDT
    expect(isWithinNotifyWindow(new Date('2026-06-13T06:30:00Z'), 'America/New_York')).toBe(false);
  });

  it('allows a late-morning Eastern alert', () => {
    // 15:00 UTC = 11:00 EDT
    expect(isWithinNotifyWindow(new Date('2026-06-13T15:00:00Z'), 'America/New_York')).toBe(true);
  });

  it('treats 9 PM as outside (exclusive end)', () => {
    // PDT = UTC-7: 03:59Z = 20:59 (inside), 04:00Z = 21:00 (outside)
    expect(isWithinNotifyWindow(new Date('2026-06-13T03:59:00Z'), 'America/Los_Angeles')).toBe(true);
    expect(isWithinNotifyWindow(new Date('2026-06-13T04:00:00Z'), 'America/Los_Angeles')).toBe(false);
  });

  it('is per-zone for the same instant', () => {
    const t = new Date('2026-06-13T13:00:00Z'); // 09:00 EDT (inside) vs 06:00 PDT (outside)
    expect(isWithinNotifyWindow(t, 'America/New_York')).toBe(true);
    expect(isWithinNotifyWindow(t, 'America/Los_Angeles')).toBe(false);
  });
});

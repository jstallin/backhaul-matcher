import { describe, it, expect } from 'vitest';
import {
  calculateArrival,
  calculateLatestDeparture,
  calculateElapsedHours,
  getSegments,
} from '../hosCalculator.js';

// Fixed departure: Monday 7:00 AM
const MON_7AM = new Date('2026-06-01T07:00:00.000Z');

// Helpers
const hoursAfter = (base, h) => new Date(base.getTime() + h * 3_600_000);
const arrivalHoursAfter = (start, miles, cfg) =>
  (calculateArrival(start, miles, cfg).getTime() - new Date(start).getTime()) / 3_600_000;

// ---------------------------------------------------------------------------
// calculateElapsedHours — total trip time including rest stops
// ---------------------------------------------------------------------------

describe('calculateElapsedHours', () => {
  it('0 miles → 0 hours', () => {
    expect(calculateElapsedHours(0)).toBe(0);
  });

  it('250 miles → 5 hours (no rest needed)', () => {
    expect(calculateElapsedHours(250)).toBeCloseTo(5);
  });

  it('500 miles → 10 hours (exactly at daily limit, no rest)', () => {
    expect(calculateElapsedHours(500)).toBeCloseTo(10);
  });

  it('501 miles → 20h 1.2min (10h drive + 10h rest + 1mi drive)', () => {
    // 500 miles = 10h, rest 10h, 1 mile = 1/50 h = 1.2 min
    expect(calculateElapsedHours(501)).toBeCloseTo(10 + 10 + 1 / 50, 4);
  });

  it('1000 miles → 30 hours (10h drive + 10h rest + 10h drive)', () => {
    expect(calculateElapsedHours(1000)).toBeCloseTo(30);
  });

  it('1250 miles → 45 hours (10h drive + 10h rest + 10h drive + 10h rest + 5h drive)', () => {
    // 500mi + rest + 500mi + rest + 250mi = 10 + 10 + 10 + 10 + 5 = 45h
    expect(calculateElapsedHours(1250)).toBeCloseTo(45);
  });

  it('1500 miles → 50 hours (10h drive + 10h rest + 10h drive + 10h rest + 10h drive)', () => {
    // 500mi + rest + 500mi + rest + 500mi = 10 + 10 + 10 + 10 + 10 = 50h
    expect(calculateElapsedHours(1500)).toBeCloseTo(50);
  });

  it('custom dailyDriveMiles overrides default', () => {
    // With 250-mile daily limit: 500mi = 250mi (5h) + rest(10h) + 250mi (5h) = 20h
    expect(calculateElapsedHours(500, { dailyDriveMiles: 250 })).toBeCloseTo(20);
  });

  it('custom driveMph overrides default speed', () => {
    // 500 miles at 55 mph = 500/55 ≈ 9.09h
    expect(calculateElapsedHours(500, { driveMph: 55 })).toBeCloseTo(500 / 55, 4);
  });

  it('custom restHours overrides default rest duration', () => {
    // 1000 miles: 10h drive + 8h rest + 10h drive = 28h
    expect(calculateElapsedHours(1000, { restHours: 8 })).toBeCloseTo(28);
  });
});

// ---------------------------------------------------------------------------
// calculateArrival
// ---------------------------------------------------------------------------

describe('calculateArrival', () => {
  it('0 miles → returns startTime unchanged', () => {
    expect(calculateArrival(MON_7AM, 0).getTime()).toBe(MON_7AM.getTime());
  });

  it('250 miles from 7AM → arrives at 12PM (5 hours)', () => {
    const arrival = calculateArrival(MON_7AM, 250);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 5).getTime());
  });

  it('500 miles from 7AM → arrives at 5PM same day (10 hours)', () => {
    const arrival = calculateArrival(MON_7AM, 500);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 10).getTime());
  });

  it('1000 miles from 7AM → arrives 30 hours later (10h drive, 10h rest, 10h drive)', () => {
    const arrival = calculateArrival(MON_7AM, 1000);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 30).getTime());
  });

  it('1250 miles from 7AM → arrives 45 hours later', () => {
    const arrival = calculateArrival(MON_7AM, 1250);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 45).getTime());
  });

  it('accepts string date input', () => {
    const arrival = calculateArrival('2026-06-01T07:00:00.000Z', 250);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 5).getTime());
  });

  it('accepts numeric timestamp input', () => {
    const arrival = calculateArrival(MON_7AM.getTime(), 250);
    expect(arrival.getTime()).toBe(hoursAfter(MON_7AM, 5).getTime());
  });

  it('negative distance treated as 0 miles', () => {
    expect(calculateArrival(MON_7AM, -100).getTime()).toBe(MON_7AM.getTime());
  });
});

// ---------------------------------------------------------------------------
// calculateLatestDeparture — inverse of calculateArrival
// ---------------------------------------------------------------------------

describe('calculateLatestDeparture', () => {
  it('is the exact inverse of calculateArrival', () => {
    const distances = [0, 250, 500, 750, 1000, 1250];
    distances.forEach(miles => {
      const arrival = calculateArrival(MON_7AM, miles);
      const departure = calculateLatestDeparture(arrival, miles);
      expect(departure.getTime()).toBeCloseTo(MON_7AM.getTime(), -1); // within 1ms
    });
  });

  it('250 miles: latest departure is 5 hours before deadline', () => {
    const deadline = hoursAfter(MON_7AM, 5);
    const departure = calculateLatestDeparture(deadline, 250);
    expect(departure.getTime()).toBe(MON_7AM.getTime());
  });

  it('1000 miles: latest departure is 30 hours before deadline', () => {
    const deadline = hoursAfter(MON_7AM, 30);
    const departure = calculateLatestDeparture(deadline, 1000);
    expect(departure.getTime()).toBe(MON_7AM.getTime());
  });
});

// ---------------------------------------------------------------------------
// getSegments — itinerary breakdown
// ---------------------------------------------------------------------------

describe('getSegments', () => {
  it('trip under daily limit produces a single segment', () => {
    const segs = getSegments(MON_7AM, 250);
    expect(segs).toHaveLength(1);
    expect(segs[0].driveMiles).toBe(250);
    expect(segs[0].restAfterHours).toBe(0);
  });

  it('exactly 500 miles produces a single segment with no rest', () => {
    const segs = getSegments(MON_7AM, 500);
    expect(segs).toHaveLength(1);
    expect(segs[0].driveMiles).toBe(500);
    expect(segs[0].restAfterHours).toBe(0);
  });

  it('1000 miles produces two segments with a rest stop between them', () => {
    const segs = getSegments(MON_7AM, 1000);
    expect(segs).toHaveLength(2);
    expect(segs[0].driveMiles).toBe(500);
    expect(segs[0].restAfterHours).toBe(10);
    expect(segs[1].driveMiles).toBe(500);
    expect(segs[1].restAfterHours).toBe(0); // last segment, no rest after
  });

  it('1250 miles: three segments — 500mi, 500mi, 250mi', () => {
    const segs = getSegments(MON_7AM, 1250);
    expect(segs).toHaveLength(3);
    expect(segs[0].driveMiles).toBe(500);
    expect(segs[1].driveMiles).toBe(500);
    expect(segs[2].driveMiles).toBe(250);
  });

  it('segment departure times are sequential and account for rest', () => {
    const segs = getSegments(MON_7AM, 1000);
    // Seg 0: departs 7AM, drives 10h, arrives 5PM
    expect(segs[0].departureTime.getTime()).toBe(MON_7AM.getTime());
    expect(segs[0].arrivalTime.getTime()).toBe(hoursAfter(MON_7AM, 10).getTime());
    // Seg 1: departs after 10h rest = 3AM next day, drives 10h
    expect(segs[1].departureTime.getTime()).toBe(hoursAfter(MON_7AM, 20).getTime());
    expect(segs[1].arrivalTime.getTime()).toBe(hoursAfter(MON_7AM, 30).getTime());
  });

  it('cumulativeMiles tracks total miles driven across segments', () => {
    const segs = getSegments(MON_7AM, 1000);
    expect(segs[0].cumulativeMiles).toBe(500);
    expect(segs[1].cumulativeMiles).toBe(1000);
  });

  it('0 miles returns empty segment array', () => {
    expect(getSegments(MON_7AM, 0)).toHaveLength(0);
  });

  it('total drive miles across segments equals input distance', () => {
    const segs = getSegments(MON_7AM, 1250);
    const totalMiles = segs.reduce((sum, s) => sum + s.driveMiles, 0);
    expect(totalMiles).toBe(1250);
  });

  it('last segment always has restAfterHours of 0', () => {
    [250, 500, 750, 1000, 1250].forEach(miles => {
      const segs = getSegments(MON_7AM, miles);
      expect(segs[segs.length - 1].restAfterHours).toBe(0);
    });
  });

  it('arrival time of last segment matches calculateArrival', () => {
    const miles = 1250;
    const segs = getSegments(MON_7AM, miles);
    const arrival = calculateArrival(MON_7AM, miles);
    expect(segs[segs.length - 1].arrivalTime.getTime()).toBe(arrival.getTime());
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectNotifiableChange,
  snapshotFromMatches,
  netOf,
  NOTIFY_NET_THRESHOLD_PCT,
} from '../notificationChangeDetection.js';

// Helper: build a ranked matches array from net values (first = top).
const matches = (...nets) => nets.map((n, i) => ({ load_id: `L${i}-${n}`, customer_net_credit: n }));
// Same load ids but new net values (top load unchanged identity).
const sameTopWithNets = (ids, nets) => ids.map((id, i) => ({ load_id: id, customer_net_credit: nets[i] }));

describe('netOf', () => {
  it('prefers net fields, falls back to gross then 0', () => {
    expect(netOf({ customer_net_credit: 100 })).toBe(100);
    expect(netOf({ netRevenue: 90 })).toBe(90);
    expect(netOf({ totalRevenue: 80 })).toBe(80); // fallback when no net
    expect(netOf({})).toBe(0);
  });
});

describe('snapshotFromMatches', () => {
  it('captures top id/net and avg net of top 25', () => {
    const snap = snapshotFromMatches(matches(500, 400, 300));
    expect(snap.topNet).toBe(500);
    expect(snap.top25AvgNet).toBe(400); // (500+400+300)/3
    expect(snap.count).toBe(3);
  });
  it('returns null for empty', () => {
    expect(snapshotFromMatches([])).toBeNull();
  });
});

describe('detectNotifiableChange', () => {
  it('is silent on first run (no baseline)', () => {
    expect(detectNotifiableChange(null, matches(500, 400))).toBeNull();
  });

  it('fires new_top when the #1 load changes', () => {
    const prev = snapshotFromMatches(matches(500, 400));
    const next = matches(600, 500, 400); // new best load id
    const c = detectNotifiableChange(prev, next);
    expect(c?.type).toBe('new_top');
  });

  it('fires top_net_up when the same top load net rises >= threshold%', () => {
    const ids = ['A', 'B', 'C'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 80, 60]));
    const next = sameTopWithNets(ids, [106, 80, 60]); // +6% on top
    const c = detectNotifiableChange(prev, next);
    expect(c?.type).toBe('top_net_up');
    expect(c.pct).toBeCloseTo(6, 5);
  });

  it('stays quiet when the top net rise is below threshold', () => {
    const ids = ['A', 'B', 'C'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 80, 60]));
    const next = sameTopWithNets(ids, [104, 80, 60]); // +4% < 5%
    expect(detectNotifiableChange(prev, next)).toBeNull();
  });

  it('does NOT fire on an individual top-load DECREASE (that is suppressed noise)', () => {
    const ids = ['A', 'B', 'C'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 80, 60]));
    const next = sameTopWithNets(ids, [90, 80, 60]); // -10% on top, but avg only down ~4.5%
    expect(detectNotifiableChange(prev, next)).toBeNull();
  });

  it('fires lane_softening when avg net of the set drops >= threshold% overall', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 100, 100, 100])); // avg 100
    const next = sameTopWithNets(ids, [100, 90, 90, 90]); // avg 92.5 → -7.5%, top id unchanged & not up
    const c = detectNotifiableChange(prev, next);
    expect(c?.type).toBe('lane_softening');
    expect(c.pct).toBeLessThanOrEqual(-NOTIFY_NET_THRESHOLD_PCT);
  });

  it('stays quiet when nothing material moves', () => {
    const ids = ['A', 'B', 'C'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 80, 60]));
    const next = sameTopWithNets(ids, [101, 80, 61]); // tiny noise
    expect(detectNotifiableChange(prev, next)).toBeNull();
  });

  it('is silent when the new result set is empty', () => {
    const prev = snapshotFromMatches(matches(500));
    expect(detectNotifiableChange(prev, [])).toBeNull();
  });

  it('respects a custom threshold', () => {
    const ids = ['A', 'B'];
    const prev = snapshotFromMatches(sameTopWithNets(ids, [100, 100]));
    const next = sameTopWithNets(ids, [103, 100]); // +3%
    expect(detectNotifiableChange(prev, next, 2)?.type).toBe('top_net_up'); // 3% >= 2%
    expect(detectNotifiableChange(prev, next, 5)).toBeNull();               // 3% < 5%
  });
});

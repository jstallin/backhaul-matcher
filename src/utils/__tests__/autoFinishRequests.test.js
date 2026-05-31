import { describe, it, expect } from 'vitest';
import { isExpiredInProgress, finishPayload, localTodayStr } from '../autoFinishRequests.js';

const TODAY = '2026-05-31';

describe('isExpiredInProgress (item 008)', () => {
  it('is true for an in_progress request needed before today', () => {
    expect(isExpiredInProgress({ status: 'in_progress', equipment_needed_date: '2026-05-30' }, TODAY)).toBe(true);
  });

  it('is false when needed date is today (the needed date is still valid)', () => {
    expect(isExpiredInProgress({ status: 'in_progress', equipment_needed_date: '2026-05-31' }, TODAY)).toBe(false);
  });

  it('is false when needed date is in the future', () => {
    expect(isExpiredInProgress({ status: 'in_progress', equipment_needed_date: '2026-06-05' }, TODAY)).toBe(false);
  });

  it('only applies to in_progress requests, not active/completed', () => {
    expect(isExpiredInProgress({ status: 'active', equipment_needed_date: '2026-05-30' }, TODAY)).toBe(false);
    expect(isExpiredInProgress({ status: 'completed', equipment_needed_date: '2026-05-30' }, TODAY)).toBe(false);
  });

  it('is false when no needed date is set', () => {
    expect(isExpiredInProgress({ status: 'in_progress', equipment_needed_date: null }, TODAY)).toBe(false);
    expect(isExpiredInProgress({ status: 'in_progress' }, TODAY)).toBe(false);
  });

  it('tolerates a full timestamp by comparing the date portion', () => {
    expect(isExpiredInProgress({ status: 'in_progress', equipment_needed_date: '2026-05-30T00:00:00Z' }, TODAY)).toBe(true);
  });
});

describe('finishPayload', () => {
  it('completes the request and turns auto-refresh off', () => {
    const p = finishPayload();
    expect(p.status).toBe('completed');
    expect(p.auto_refresh).toBe(false);
    expect(p.completed_at).toBeTruthy();
  });

  it('does not touch revenue/hauled-load fields (they are preserved)', () => {
    const p = finishPayload();
    expect(p).not.toHaveProperty('revenue_amount');
    expect(p).not.toHaveProperty('net_revenue');
    expect(p).not.toHaveProperty('hauled_load_id');
  });
});

describe('localTodayStr', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    expect(localTodayStr(new Date(2026, 4, 9))).toBe('2026-05-09');
  });
});

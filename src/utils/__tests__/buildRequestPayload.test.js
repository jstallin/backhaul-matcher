import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRequestPayload } from '../buildRequestPayload.js';

const baseForm = {
  requestName: '  Burlington Run  ',
  datumCity: '  Burlington  ',
  datumState: '  nc  ',
  datumLat: 36.0726,
  datumLng: -79.4569,
  selectedFleetId: 'fleet-abc',
  equipmentAvailableDate: '2026-06-01',
  equipmentNeededDate: '2026-06-05',
  isRelay: false,
  autoRefresh: false,
  autoRefreshInterval: 2,
  notificationEnabled: false,
  notificationMethod: 'email',
};

const USER_ID = 'user-xyz';

describe('buildRequestPayload', () => {
  describe('datum field mapping', () => {
    it('trims and uppercases datum_state', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.datum_state).toBe('NC');
    });

    it('trims datum_city', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.datum_city).toBe('Burlington');
    });

    it('builds datum_point as "City, STATE"', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.datum_point).toBe('Burlington, NC');
    });

    it('passes through datum_lat and datum_lng', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.datum_lat).toBe(36.0726);
      expect(p.datum_lng).toBe(-79.4569);
    });

    it('sets datum_lat/lng to null when falsy', () => {
      const p = buildRequestPayload({ ...baseForm, datumLat: null, datumLng: null }, USER_ID);
      expect(p.datum_lat).toBeNull();
      expect(p.datum_lng).toBeNull();
    });
  });

  describe('auto_refresh behavior', () => {
    it('sets auto_refresh_interval to null when autoRefresh is false', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: false }, USER_ID);
      expect(p.auto_refresh_interval).toBeNull();
    });

    it('converts autoRefreshInterval hours→seconds when autoRefresh is true', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: true, autoRefreshInterval: 2 }, USER_ID);
      expect(p.auto_refresh_interval).toBe(120); // 2 * 60
    });

    it('sets next_refresh_at when autoRefresh is true', () => {
      const now = new Date('2026-06-01T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const p = buildRequestPayload({ ...baseForm, autoRefresh: true, autoRefreshInterval: 2 }, USER_ID);
      expect(p.next_refresh_at).toBeDefined();
      expect(new Date(p.next_refresh_at).getTime()).toBe(now + 120 * 60 * 1000);
      vi.useRealTimers();
    });

    it('does not set next_refresh_at when autoRefresh is false', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: false }, USER_ID);
      expect(p).not.toHaveProperty('next_refresh_at');
    });
  });

  describe('modes (#36)', () => {
    it('passes a non-empty request modes array through', () => {
      const p = buildRequestPayload({ ...baseForm, modes: ['Partial', 'Intermodal'] }, USER_ID);
      expect(p.modes).toEqual(['Partial', 'Intermodal']);
    });
    it('is null when modes is empty or absent', () => {
      expect(buildRequestPayload({ ...baseForm, modes: [] }, USER_ID).modes).toBeNull();
      expect(buildRequestPayload(baseForm, USER_ID).modes).toBeNull();
    });
  });

  describe('max_auto_refreshes cap (item 006)', () => {
    it('is null when no limit is given (unlimited)', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: true, maxAutoRefreshes: '' }, USER_ID);
      expect(p.max_auto_refreshes).toBeNull();
    });

    it('parses a positive integer limit', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: true, maxAutoRefreshes: '5' }, USER_ID);
      expect(p.max_auto_refreshes).toBe(5);
    });

    it('is null when autoRefresh is off even if a limit was typed', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: false, maxAutoRefreshes: '5' }, USER_ID);
      expect(p.max_auto_refreshes).toBeNull();
    });

    it('ignores zero, negative, and non-numeric limits', () => {
      for (const bad of ['0', '-3', 'abc']) {
        const p = buildRequestPayload({ ...baseForm, autoRefresh: true, maxAutoRefreshes: bad }, USER_ID);
        expect(p.max_auto_refreshes).toBeNull();
      }
    });

    it('always resets auto_refresh_count to 0 on save', () => {
      const p = buildRequestPayload({ ...baseForm, autoRefresh: true, maxAutoRefreshes: '5' }, USER_ID);
      expect(p.auto_refresh_count).toBe(0);
    });
  });

  describe('driver_home_by (#81)', () => {
    it('passes the date through when set', () => {
      const p = buildRequestPayload({ ...baseForm, driverHomeBy: '2026-06-10' }, USER_ID);
      expect(p.driver_home_by).toBe('2026-06-10');
    });

    it('is null when empty or absent (optional field)', () => {
      expect(buildRequestPayload({ ...baseForm, driverHomeBy: '' }, USER_ID).driver_home_by).toBeNull();
      expect(buildRequestPayload(baseForm, USER_ID).driver_home_by).toBeNull();
    });
  });

  describe('notification behavior', () => {
    it('sets notification_method to null when notificationEnabled is false', () => {
      const p = buildRequestPayload({ ...baseForm, notificationEnabled: false, notificationMethod: 'email' }, USER_ID);
      expect(p.notification_method).toBeNull();
    });

    it('passes notification_method through when notificationEnabled is true', () => {
      const p = buildRequestPayload({ ...baseForm, notificationEnabled: true, notificationMethod: 'sms' }, USER_ID);
      expect(p.notification_method).toBe('sms');
    });
  });

  describe('general shape', () => {
    it('trims request_name', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.request_name).toBe('Burlington Run');
    });

    it('always sets status to active', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.status).toBe('active');
    });

    it('sets user_id from argument', () => {
      const p = buildRequestPayload(baseForm, USER_ID);
      expect(p.user_id).toBe(USER_ID);
    });
  });
});

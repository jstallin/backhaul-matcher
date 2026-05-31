import { describe, it, expect } from 'vitest';
import { buildFleetPayload } from '../buildFleetPayload.js';

const baseForm = {
  name: 'Test Fleet',
  mcNumber: 'MC123456',
  dotNumber: 'DOT789',
  phoneNumber: '555-1234',
  email: 'test@fleet.com',
  homeAddress: '123 Main St, Greensboro, NC',
  homeLat: 36.0726,
  homeLng: -79.7920,
  trailerType: 'Dry Van',
  revenueSplitCarrier: 80,
  mileageRate: '1.50',
  stopRate: '50',
  fuelPeg: '0.10',
  fuelMpg: '6.5',
  doePaddRegion: 'lower_atlantic',
  doePaddRate: '3.85',
  otherCharge1Name: 'Lumper',
  otherCharge1Description: 'Unloading fee',
  otherCharge1Amount: '75',
  otherCharge2Name: '',
  otherCharge2Description: '',
  otherCharge2Amount: '',
};

describe('buildFleetPayload', () => {
  describe('table routing — the bug this test was written to catch', () => {
    it('does NOT include trailer_type in fleetData', () => {
      const { fleetData } = buildFleetPayload(baseForm);
      expect(fleetData).not.toHaveProperty('trailer_type');
    });

    it('includes trailer_type in profileData', () => {
      const { profileData } = buildFleetPayload(baseForm);
      expect(profileData.trailer_type).toBe('Dry Van');
    });

    it('sets trailer_type to null when blank', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, trailerType: '' });
      expect(profileData.trailer_type).toBeNull();
    });
  });

  describe('fleetData shape', () => {
    it('maps camelCase form fields to snake_case DB columns', () => {
      const { fleetData } = buildFleetPayload(baseForm);
      expect(fleetData).toMatchObject({
        name:         'Test Fleet',
        mc_number:    'MC123456',
        dot_number:   'DOT789',
        phone_number: '555-1234',
        email:        'test@fleet.com',
        home_address: '123 Main St, Greensboro, NC',
        home_lat:     36.0726,
        home_lng:     -79.7920,
      });
    });

    it('contains exactly the expected keys', () => {
      const { fleetData } = buildFleetPayload(baseForm);
      expect(Object.keys(fleetData).sort()).toEqual([
        'dot_number', 'email', 'home_address', 'home_lat', 'home_lng',
        'mc_number', 'name', 'phone_number',
      ]);
    });
  });

  describe('profileData shape', () => {
    it('coerces numeric strings to numbers', () => {
      const { profileData } = buildFleetPayload(baseForm);
      expect(profileData.mileage_rate).toBe(1.5);
      expect(profileData.stop_rate).toBe(50);
      expect(profileData.fuel_peg).toBe(0.1);
      expect(profileData.fuel_mpg).toBe(6.5);
    });

    it('sets empty numeric fields to null', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, otherCharge2Amount: '' });
      expect(profileData.other_charge_2_amount).toBeNull();
    });

    it('defaults revenue_split_carrier to 20 when blank', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, revenueSplitCarrier: '' });
      expect(profileData.revenue_split_carrier).toBe(20);
    });

    it('defaults fuel_mpg to 6 when blank', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, fuelMpg: '' });
      expect(profileData.fuel_mpg).toBe(6);
    });
  });

  describe('modes (item 007)', () => {
    it('passes a non-empty modes array through to profileData', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, modes: ['Truck Load', 'Partial'] });
      expect(profileData.modes).toEqual(['Truck Load', 'Partial']);
    });

    it('sets modes to null when the array is empty', () => {
      const { profileData } = buildFleetPayload({ ...baseForm, modes: [] });
      expect(profileData.modes).toBeNull();
    });

    it('sets modes to null when the field is absent', () => {
      const { profileData } = buildFleetPayload(baseForm);
      expect(profileData.modes).toBeNull();
    });
  });
});

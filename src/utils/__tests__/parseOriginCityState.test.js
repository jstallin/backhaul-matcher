import { describe, it, expect } from 'vitest';
import { parseOriginCityState } from '../parseOriginCityState.js';

describe('parseOriginCityState', () => {
  describe('clean city/state input', () => {
    it('handles "Greensboro, NC"', () => {
      expect(parseOriginCityState('Greensboro', 'NC')).toEqual({ city: 'Greensboro', state: 'nc' });
    });

    it('handles lowercase state code', () => {
      expect(parseOriginCityState('Burlington', 'nc')).toEqual({ city: 'Burlington', state: 'nc' });
    });

    it('handles city embedded in rawCity with state code', () => {
      expect(parseOriginCityState('Greensboro, NC', '')).toEqual({ city: 'Greensboro', state: 'nc' });
    });
  });

  describe('PC*MILER full geocoded strings', () => {
    it('extracts city and state from "Dallas, Dallas County, Texas, United States"', () => {
      expect(parseOriginCityState('Dallas, Dallas County, Texas, United States', '')).toEqual({ city: 'Dallas', state: 'tx' });
    });

    it('extracts city and state from "Joplin, Jasper County, Missouri, United States"', () => {
      expect(parseOriginCityState('Joplin, Jasper County, Missouri, United States', '')).toEqual({ city: 'Joplin', state: 'mo' });
    });

    it('handles full state name in rawState', () => {
      expect(parseOriginCityState('Burlington', 'North Carolina')).toEqual({ city: 'Burlington', state: 'nc' });
    });
  });

  describe('street addresses', () => {
    it('strips street prefix from "7663 sw 170th St Palmetto Bay, fl"', () => {
      expect(parseOriginCityState('7663 sw 170th St Palmetto Bay, fl', '')).toEqual({ city: 'Palmetto Bay', state: 'fl' });
    });

    it('strips Ave prefix', () => {
      expect(parseOriginCityState('1234 Main Ave Springfield, IL', '')).toEqual({ city: 'Springfield', state: 'il' });
    });

    it('strips Blvd prefix', () => {
      expect(parseOriginCityState('999 Oak Blvd Atlanta, GA', '')).toEqual({ city: 'Atlanta', state: 'ga' });
    });
  });

  describe('edge cases', () => {
    it('returns empty state when no state can be found', () => {
      const result = parseOriginCityState('SomeCity', '');
      expect(result.city).toBe('SomeCity');
      expect(result.state).toBe('');
    });

    it('handles empty input without throwing', () => {
      expect(() => parseOriginCityState('', '')).not.toThrow();
    });

    it('handles null rawState without throwing', () => {
      expect(() => parseOriginCityState('Greensboro, NC', null)).not.toThrow();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { FLEET_MODES, unionModes, modesOfFleet, searchModes } from '../fleetModes.js';

describe('FLEET_MODES', () => {
  it('contains the agreed 9 modes including Partial', () => {
    expect(FLEET_MODES).toContain('Partial');
    expect(FLEET_MODES).toHaveLength(9);
  });
});

describe('unionModes (#36)', () => {
  it('combines fleet + request modes, deduped', () => {
    expect(unionModes(['Truck Load', 'Partial'], ['Partial', 'Intermodal']))
      .toEqual(['Truck Load', 'Partial', 'Intermodal']);
  });

  it('returns the other set when one is empty/null', () => {
    expect(unionModes(['Truck Load'], null)).toEqual(['Truck Load']);
    expect(unionModes(null, ['Partial'])).toEqual(['Partial']);
    expect(unionModes([], ['Partial'])).toEqual(['Partial']);
  });

  it('returns empty array when both are empty/missing', () => {
    expect(unionModes(null, undefined)).toEqual([]);
    expect(unionModes([], [])).toEqual([]);
  });

  it('does not mutate the inputs', () => {
    const a = ['Truck Load'];
    const b = ['Partial'];
    unionModes(a, b);
    expect(a).toEqual(['Truck Load']);
    expect(b).toEqual(['Partial']);
  });
});

describe('modesOfFleet (#30)', () => {
  it('reads modes from fleet_profiles joined as an array', () => {
    expect(modesOfFleet({ fleet_profiles: [{ modes: ['Truck Load', 'Drayage'] }] }))
      .toEqual(['Truck Load', 'Drayage']);
  });

  it('reads modes from fleet_profiles joined as an object', () => {
    expect(modesOfFleet({ fleet_profiles: { modes: ['Partial'] } })).toEqual(['Partial']);
  });

  it('falls back to a top-level modes array', () => {
    expect(modesOfFleet({ modes: ['Ocean'] })).toEqual(['Ocean']);
  });

  it('returns [] for null fleet or missing/blank modes', () => {
    expect(modesOfFleet(null)).toEqual([]);
    expect(modesOfFleet({ fleet_profiles: [{}] })).toEqual([]);
    expect(modesOfFleet({})).toEqual([]);
  });
});

describe('searchModes (#30)', () => {
  it('unions fleet-profile modes with request modes', () => {
    const fleet = { fleet_profiles: [{ modes: ['Truck Load', 'Partial'] }] };
    const request = { modes: ['Partial', 'Intermodal'] };
    expect(searchModes(fleet, request)).toEqual(['Truck Load', 'Partial', 'Intermodal']);
  });

  it('returns [] when neither fleet nor request restricts modes', () => {
    expect(searchModes({ fleet_profiles: [{}] }, {})).toEqual([]);
    expect(searchModes(null, null)).toEqual([]);
  });
});

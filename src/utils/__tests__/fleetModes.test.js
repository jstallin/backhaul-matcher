import { describe, it, expect } from 'vitest';
import { FLEET_MODES, unionModes } from '../fleetModes.js';

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

import { describe, it, expect } from 'vitest';
import { EQUIP_TO_TS } from '../_lib/truckstop.js';
import { FLEET_TRAILER_TYPES } from '../../src/utils/equipmentTypes.js';

// Guards issue #146: a UI trailer-type option without a Truckstop code silently
// returns 0 loads. These tests fail loudly if the dropdown and the code map drift.
describe('Truckstop equipment-type mapping', () => {
  it('maps every UI trailer-type option to a Truckstop code', () => {
    const unmapped = FLEET_TRAILER_TYPES.filter((type) => !EQUIP_TO_TS[type]);
    expect(unmapped, `unmapped trailer types: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('emits a single-token code for each type (no space-separated multi-codes)', () => {
    // A space-separated value like 'V F R SD LB' is the original #146 bug — Truckstop
    // treats it as one invalid code and returns 0 loads.
    for (const type of FLEET_TRAILER_TYPES) {
      const code = EQUIP_TO_TS[type];
      expect(code, type).toBeTruthy();
      expect(code, type).not.toMatch(/\s/);
    }
  });
});

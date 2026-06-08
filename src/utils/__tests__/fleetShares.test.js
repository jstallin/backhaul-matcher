import { describe, it, expect } from 'vitest';
import { diffShareSet } from '../fleetShares';

describe('diffShareSet (#129)', () => {
  it('returns nothing to change when sets are equal (order-independent)', () => {
    expect(diffShareSet(['a', 'b'], ['b', 'a'])).toEqual({ added: [], removed: [] });
  });

  it('detects added grantees', () => {
    expect(diffShareSet(['a'], ['a', 'b', 'c'])).toEqual({ added: ['b', 'c'], removed: [] });
  });

  it('detects removed grantees', () => {
    expect(diffShareSet(['a', 'b', 'c'], ['a'])).toEqual({ added: [], removed: ['b', 'c'] });
  });

  it('detects simultaneous add + remove', () => {
    expect(diffShareSet(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('treats empty/undefined inputs as empty sets', () => {
    expect(diffShareSet(undefined, ['a'])).toEqual({ added: ['a'], removed: [] });
    expect(diffShareSet(['a'], undefined)).toEqual({ added: [], removed: ['a'] });
    expect(diffShareSet(null, null)).toEqual({ added: [], removed: [] });
  });

  it('dedupes and ignores falsy ids', () => {
    expect(diffShareSet(['a', 'a'], ['a', null, ''])).toEqual({ added: [], removed: [] });
  });
});

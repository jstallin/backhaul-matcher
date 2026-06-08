import { describe, it, expect } from 'vitest';
import { generateRequestName } from '../requestName';

// Fixed clock: June 8, 2026, 1:05:09 PM local.
const NOW = new Date(2026, 5, 8, 13, 5, 9);

describe('generateRequestName (#128)', () => {
  it('composes "<name> — <location> — <date>"', () => {
    expect(generateRequestName({ displayName: 'Sarah Kennedy', location: 'Charlotte, NC', now: NOW }))
      .toBe('Sarah Kennedy — Charlotte, NC — 6/8/2026');
  });

  it('falls back to "Backhaul" when the display name is blank', () => {
    expect(generateRequestName({ displayName: '', location: 'Charlotte, NC', now: NOW }))
      .toBe('Backhaul — Charlotte, NC — 6/8/2026');
  });

  it('omits the location segment when it is blank', () => {
    expect(generateRequestName({ displayName: 'Sarah Kennedy', location: '', now: NOW }))
      .toBe('Sarah Kennedy — 6/8/2026');
  });

  it('returns the date form when there is no collision', () => {
    const name = generateRequestName({
      displayName: 'Sarah Kennedy', location: 'Charlotte, NC',
      existingNames: ['Some Other Request'], now: NOW,
    });
    expect(name).toBe('Sarah Kennedy — Charlotte, NC — 6/8/2026');
  });

  it('swaps the date for a timestamp on collision', () => {
    const name = generateRequestName({
      displayName: 'Sarah Kennedy', location: 'Charlotte, NC',
      existingNames: ['Sarah Kennedy — Charlotte, NC — 6/8/2026'], now: NOW,
    });
    expect(name).toBe('Sarah Kennedy — Charlotte, NC — 6/8/2026 1:05:09 PM');
  });

  it('treats the collision check case-insensitively', () => {
    const name = generateRequestName({
      displayName: 'Sarah Kennedy', location: 'Charlotte, NC',
      existingNames: ['sarah kennedy — charlotte, nc — 6/8/2026'], now: NOW,
    });
    expect(name).toContain('1:05:09 PM');
  });

  it('tolerates null/garbage entries in existingNames', () => {
    expect(() => generateRequestName({
      displayName: 'Sarah Kennedy', location: 'Charlotte, NC',
      existingNames: [null, undefined, ''], now: NOW,
    })).not.toThrow();
  });
});

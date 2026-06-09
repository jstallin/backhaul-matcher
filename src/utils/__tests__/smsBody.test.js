import { describe, it, expect } from 'vitest';
import { brandSms } from '../smsBody';

describe('brandSms (#140 A2P branding + opt-out)', () => {
  it('adds the brand prefix and a STOP reminder to a plain body', () => {
    expect(brandSms('New #1 backhaul for ATL Run: $450 net.'))
      .toBe('Haul Monitor: New #1 backhaul for ATL Run: $450 net. Reply STOP to opt out, HELP for help.');
  });

  it('does not double-brand when the body already names Haul Monitor', () => {
    const out = brandSms('Shared via Haul Monitor — haulmonitor.cloud');
    expect(out.match(/Haul Monitor/g)).toHaveLength(1);
    expect(out).toContain('STOP');
  });

  it('does not duplicate the opt-out when STOP is already present', () => {
    const out = brandSms('Backhaul update. Reply STOP to cancel.');
    expect(out.match(/STOP/g)).toHaveLength(1);
    expect(out.startsWith('Haul Monitor:')).toBe(true);
  });

  it('tolerates empty/null input', () => {
    expect(brandSms('')).toBe('Haul Monitor: Reply STOP to opt out, HELP for help.');
    expect(brandSms(null)).toContain('Haul Monitor');
  });
});

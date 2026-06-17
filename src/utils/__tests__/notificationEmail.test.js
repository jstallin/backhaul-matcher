import { describe, it, expect } from 'vitest';
import { buildRequestLink, buildBackhaulNotification } from '../notificationEmail';

// The shared notification builder is used by BOTH the client path and the cron, so these
// guard the contract that makes their emails identical: same deep-link format, branded HTML,
// and GSM-7-safe SMS.

const match = { origin: { city: 'Lexington', state: 'OH' }, destination: { city: 'Huntersville', state: 'NC' } };

describe('buildRequestLink', () => {
  it('builds {base}/app?request={id} (the cron-confirmed deep link)', () => {
    expect(buildRequestLink('https://haulmonitor.cloud', 'abc-123')).toBe('https://haulmonitor.cloud/app?request=abc-123');
  });
  it('trims a trailing slash on the base', () => {
    expect(buildRequestLink('https://haulmonitor.cloud/', 'abc-123')).toBe('https://haulmonitor.cloud/app?request=abc-123');
  });
  it('falls back to /app when no request id', () => {
    expect(buildRequestLink('https://haulmonitor.cloud', null)).toBe('https://haulmonitor.cloud/app');
  });
});

describe('buildBackhaulNotification', () => {
  const link = 'https://haulmonitor.cloud/app?request=abc-123';
  const ctx = { requestName: 'New Data', fleetName: 'Jason Test Fleet', link };

  it('new_top: branded HTML + matching text + the deep link', () => {
    const { subject, text, html, sms } = buildBackhaulNotification({ type: 'new_top', match, newNet: 933 }, ctx);
    expect(subject).toContain('New top backhaul for New Data');
    // HTML is the branded template and carries the working link + values
    expect(html).toContain('Haul Monitor');
    expect(html).toContain('View this request');
    expect(html).toContain(link);
    expect(html).toContain('$933');
    expect(html).toContain('Jason Test Fleet');
    expect(html).toContain('Lexington, OH → Huntersville, NC');
    // Plain-text fallback carries the same link + figures
    expect(text).toContain(link);
    expect(text).toContain('$933');
    // SMS stays GSM-7 safe (ASCII arrow, no Unicode →)
    expect(sms).toContain('->');
    expect(sms).not.toContain('→');
    expect(sms).toContain(link);
  });

  it('top_net_up: surfaces the percent rise', () => {
    const { subject, text, html } = buildBackhaulNotification({ type: 'top_net_up', match, newNet: 1180, pct: 12.4 }, ctx);
    expect(subject).toContain('improved');
    expect(text).toContain('12%');
    expect(html).toContain('$1,180');
  });

  it('lane_softening: surfaces the average net', () => {
    const { subject, html } = buildBackhaulNotification({ type: 'lane_softening', avgNet: 720, pct: -8.2 }, ctx);
    expect(subject).toContain('Lane softening');
    expect(html).toContain('$720');
  });

  it('omits the Fleet row when no fleet name is supplied', () => {
    const { html } = buildBackhaulNotification({ type: 'new_top', match, newNet: 500 }, { requestName: 'X', link });
    expect(html).not.toContain('Fleet:');
  });
});

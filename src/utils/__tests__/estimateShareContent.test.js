import { describe, it, expect } from 'vitest';
import {
  buildEstimateSubject,
  buildEstimateText,
  buildEstimateHtml,
  buildEstimateCopyText,
} from '../estimateShareContent.js';

const estimate = {
  request_name: 'Carolinas Backhaul Q3',
  datum_point: 'Burlington, NC',
  return_to_city: 'Davidson',
  return_to_state: 'NC',
  equipment_available_date: '2026-06-09',
  equipment_needed_date: '2026-06-16',
};

const fleet = { name: 'Stallings Transport', home_address: 'Davidson, NC' };

const metrics = {
  totalOpportunities: 12,
  highestNet:  { netCredit: 980, annualCredit: 235200 },
  averageAll:  { netCredit: 610, annualCredit: 146400 },
  averageTop5: { netCredit: 820, annualCredit: 196800 },
};

describe('buildEstimateSubject', () => {
  it('names the sender and the estimate', () => {
    expect(buildEstimateSubject('Jason Stallings', estimate))
      .toBe('Jason Stallings shared a backhaul estimate: Carolinas Backhaul Q3');
  });
});

describe('buildEstimateText (rich)', () => {
  const text = buildEstimateText({ estimate, fleet, metrics, annualVolume: 240 }, { size: 'rich' });

  it('includes the relabeled Empty City, ST line', () => {
    expect(text).toContain('Empty City, ST: Burlington, NC');
  });
  it('uses fleet home for the Home line when a fleet is attached', () => {
    expect(text).toContain('Home: Davidson, NC');
    expect(text).toContain('Fleet: Stallings Transport');
  });
  it('summarizes opportunity count and net figures', () => {
    expect(text).toContain('Opportunities found: 12');
    expect(text).toContain('Highest net / load: $980');
    expect(text).toContain('Avg net / load (all): $610');
  });
  it('shows projected annual net when a volume is set', () => {
    expect(text).toContain('Projected annual net (avg all loads): $146,400/yr');
  });
});

describe('buildEstimateText (fleet-less, no volume)', () => {
  const text = buildEstimateText(
    { estimate, fleet: null, metrics, annualVolume: 0 },
    { size: 'rich' },
  );
  it('falls back to return_to city/state for Home', () => {
    expect(text).toContain('Home: Davidson, NC');
    expect(text).toContain('Fleet: —');
  });
  it('omits annual projection when no volume', () => {
    expect(text).not.toContain('Projected annual net');
    expect(text).not.toContain('Annual Volume');
  });
});

describe('buildEstimateText (compact)', () => {
  const text = buildEstimateText({ estimate, fleet, metrics, annualVolume: 240 }, { size: 'compact' });
  it('is a short SMS-friendly summary', () => {
    expect(text).toContain('12 opportunities found.');
    expect(text).toContain('via Haul Monitor');
    expect(text.split('\n').length).toBeLessThanOrEqual(5);
  });
});

describe('buildEstimateHtml', () => {
  const html = buildEstimateHtml({ estimate, fleet, metrics, annualVolume: 240 }, { note: 'Take a look', senderName: 'Jason' });
  it('renders the note and summary figures', () => {
    expect(html).toContain('Take a look');
    expect(html).toContain('Empty City, ST');
    expect(html).toContain('$980');
  });
  it('escapes angle brackets in user content', () => {
    const evil = buildEstimateHtml({ estimate, fleet, metrics, annualVolume: 0 }, { note: '<script>x</script>', senderName: 'A' });
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;script&gt;');
  });
});

describe('buildEstimateCopyText', () => {
  it('matches the rich text summary', () => {
    const ctx = { estimate, fleet, metrics, annualVolume: 240 };
    expect(buildEstimateCopyText(ctx)).toBe(buildEstimateText(ctx, { size: 'rich' }));
  });
});

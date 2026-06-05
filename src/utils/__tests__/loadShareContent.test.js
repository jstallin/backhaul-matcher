import { describe, it, expect } from 'vitest';
import {
  buildShareSubject,
  buildShareText,
  buildShareHtml,
  buildShareMapStops,
  NOTE_MAX_EMAIL,
  NOTE_MAX_TEXT,
} from '../loadShareContent.js';

const baseMatch = {
  origin: { address: 'Atlanta, GA', city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  destination: { address: 'Greensboro, NC', city: 'Greensboro', state: 'NC', lat: 36.0726, lng: -79.792 },
  distance: 340,
  additionalMiles: 42,
  finalToPickup: 18,
  delivery_to_home_miles: 25,
  revenuePerMile: 2.85,
  totalRevenue: 1250,
  pickupDate: '2026-06-09',
  weight: 42000,
  trailerLength: 53,
  equipmentType: 'Dry Van',
  freightType: 'General Freight',
  broker: 'Acme Logistics',
  contactName: 'Pat Jones',
  contactPhone: '555-867-5309',
  companyEmail: 'dispatch@acme.test',
  has_rate_config: true,
  customer_share: 875,
  carrier_revenue: 375,
  mileage_expense: 63,
  stop_expense: 50,
  stop_count: 2,
  fuel_surcharge: 21,
  other_charges: 0,
  customer_net_credit: 741,
};

const request = { datum_point: 'Burlington, NC', datum_lat: 36.0957, datum_lng: -79.4378 };
const fleetHome = { address: 'Davidson, NC', lat: 35.4993, lng: -80.8487 };

describe('buildShareSubject', () => {
  it('is sender-first with the route', () => {
    expect(buildShareSubject('Jason Stallings', baseMatch))
      .toBe('Jason Stallings shared a load with you: Atlanta, GA → Greensboro, NC');
  });
});

describe('buildShareText (compact / SMS)', () => {
  it('includes headline numbers and broker phone', () => {
    const t = buildShareText(baseMatch, request, { size: 'compact' });
    expect(t).toContain('Atlanta, GA → Greensboro, NC');
    expect(t).toContain('Pickup: Jun 9, 2026');
    expect(t).toContain('Load miles: 340');
    expect(t).toContain('$1,250');
    expect(t).toContain('$2.85/mi');
    expect(t).toContain('Net credit: $741');
    expect(t).toContain('Broker: Acme Logistics 555-867-5309');
  });

  it('omits financial breakdown details', () => {
    const t = buildShareText(baseMatch, request, { size: 'compact' });
    expect(t).not.toContain('Customer share');
    expect(t).not.toContain('Fuel surcharge');
  });

  it('stays SMS-friendly in size', () => {
    const t = buildShareText(baseMatch, request, { size: 'compact' });
    expect(t.length).toBeLessThan(320);
  });
});

describe('buildShareText (rich)', () => {
  it('includes full route, financial breakdown, and contact', () => {
    const t = buildShareText(baseMatch, request, { size: 'rich' });
    expect(t).toContain('Burlington, NC → pickup: 18 mi');
    expect(t).toContain('Delivery → home: 25 mi');
    expect(t).toContain('Extra miles vs. empty return: 42 mi');
    expect(t).toContain('Customer share: $875');
    expect(t).toContain('Stop expense (2): -$50');
    expect(t).toContain('Net credit: $741');
    expect(t).toContain('Phone: 555-867-5309');
    expect(t).toContain('haulmonitor.cloud');
  });

  it('omits the financial section without rate config', () => {
    const t = buildShareText({ ...baseMatch, has_rate_config: false }, request, { size: 'rich' });
    expect(t).not.toContain('Financials:');
    expect(t).toContain('Rate: $1,250'); // gross rate still shown
  });

  it('handles missing optional fields without leaking nulls', () => {
    const minimal = {
      origin: { address: 'Atlanta, GA' },
      destination: { address: 'Greensboro, NC' },
      distance: 340,
      additionalMiles: 42,
      totalRevenue: 0,
      revenuePerMile: 0,
    };
    const t = buildShareText(minimal, null, { size: 'rich' });
    expect(t).not.toContain('null');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('Broker:');
  });
});

describe('buildShareHtml', () => {
  it('places the note at the top and escapes HTML in it', () => {
    const html = buildShareHtml(baseMatch, request, { note: 'Call <b>now</b> & book', senderName: 'Jason' });
    expect(html).toContain('Call &lt;b&gt;now&lt;/b&gt; &amp; book');
    expect(html.indexOf('Call &lt;b&gt;')).toBeLessThan(html.indexOf('Atlanta, GA'));
  });

  it('embeds the map via cid when provided, omits img otherwise', () => {
    expect(buildShareHtml(baseMatch, request, { mapCid: 'routemap' })).toContain('src="cid:routemap"');
    expect(buildShareHtml(baseMatch, request, {})).not.toContain('<img');
  });

  it('includes financials and contact sections', () => {
    const html = buildShareHtml(baseMatch, request, { senderName: 'Jason' });
    expect(html).toContain('Net credit');
    expect(html).toContain('Acme Logistics');
    expect(html).toContain('Jason shared a load with you');
  });
});

describe('buildShareMapStops', () => {
  it('builds datum → pickup → delivery → home', () => {
    const stops = buildShareMapStops(baseMatch, request, fleetHome);
    expect(stops.map(s => s.address)).toEqual(['Burlington, NC', 'Atlanta, GA', 'Greensboro, NC', 'Davidson, NC']);
    expect(stops[0].lat).toBe(36.0957);
  });

  it('keeps null coords (Truckstop loads) so the server geocodes by address', () => {
    const m = { ...baseMatch, origin: { address: 'Atlanta, GA', lat: null, lng: null } };
    const stops = buildShareMapStops(m, request, fleetHome);
    expect(stops[1]).toEqual({ address: 'Atlanta, GA', lat: null, lng: null });
  });

  it('skips datum/home when absent', () => {
    const stops = buildShareMapStops(baseMatch, null, null);
    expect(stops.map(s => s.address)).toEqual(['Atlanta, GA', 'Greensboro, NC']);
  });
});

describe('note caps', () => {
  it('email cap is larger than text cap', () => {
    expect(NOTE_MAX_EMAIL).toBeGreaterThan(NOTE_MAX_TEXT);
    expect(NOTE_MAX_EMAIL).toBe(1000);
    expect(NOTE_MAX_TEXT).toBe(300);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the PC*MILER client so the helper can be tested without the proxy.
vi.mock('../pcMilerClient', () => ({
  geocodeAddress: vi.fn(async (q) => {
    const table = {
      'Cleveland, OH': { lat: 41.5, lng: -81.69 },
      'Charlotte, NC': { lat: 35.22, lng: -80.84 },
    };
    return table[q] || null;
  }),
}));

import { geocodeMissingCoords } from '../geocodeMatchCoords';
import { geocodeAddress } from '../pcMilerClient';

beforeEach(() => geocodeAddress.mockClear());

describe('geocodeMissingCoords (#164)', () => {
  it('fills missing pickup/delivery coords (flat + nested) for coordless loads', async () => {
    const matches = [{
      load_id: '1', pickup_city: 'Cleveland', pickup_state: 'OH', pickup_lat: null, pickup_lng: null,
      delivery_city: 'Charlotte', delivery_state: 'NC', delivery_lat: null, delivery_lng: null,
      origin: { city: 'Cleveland', state: 'OH' }, destination: { city: 'Charlotte', state: 'NC' },
    }];
    const out = await geocodeMissingCoords(matches);
    expect(out[0].pickup_lat).toBe(41.5);
    expect(out[0].delivery_lat).toBe(35.22);
    expect(out[0].origin.lat).toBe(41.5);     // nested filled too (for the detail map)
    expect(out[0].destination.lng).toBe(-80.84);
  });

  it('returns the same array (no work) when nothing is missing', async () => {
    const matches = [{ load_id: '1', pickup_lat: 1, pickup_lng: 2, delivery_lat: 3, delivery_lng: 4 }];
    const out = await geocodeMissingCoords(matches);
    expect(out).toBe(matches);
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('dedupes city lookups (same city geocoded once)', async () => {
    const matches = [
      { load_id: '1', pickup_city: 'Cleveland', pickup_state: 'OH', pickup_lat: null, delivery_lat: 9, delivery_lng: 9 },
      { load_id: '2', pickup_city: 'Cleveland', pickup_state: 'OH', pickup_lat: null, delivery_lat: 9, delivery_lng: 9 },
    ];
    await geocodeMissingCoords(matches);
    expect(geocodeAddress).toHaveBeenCalledTimes(1); // one unique "Cleveland, OH"
  });

  it('leaves a load unresolved when the geocoder has no hit (no throw)', async () => {
    const matches = [{ load_id: '1', pickup_city: 'Nowhere', pickup_state: 'ZZ', pickup_lat: null, delivery_lat: 5, delivery_lng: 5 }];
    const out = await geocodeMissingCoords(matches);
    expect(out[0].pickup_lat).toBeNull();
  });
});

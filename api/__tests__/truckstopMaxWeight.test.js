import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchTruckstopLoads } from '../_lib/truckstop.js';

// #158: fetchTruckstopLoads applies an optional post-fetch max-weight filter
// (Truckstop's SOAP LoadSearch has no weight criterion). Loads above the cap are
// dropped; loads with no reported weight pass through (unknown-weight is kept).

// A SOAP body with three loads: 40k lbs, 48k lbs, and one with no Weight element.
const soapWithLoads = () => ({
  ok: true,
  status: 200,
  text: async () => `
    <Envelope><Body><GetMultipleLoadDetailResultsResponse><GetMultipleLoadDetailResultsResult>
      <DetailResults>
        <MultipleLoadDetailResult><ID>1</ID><OriginCity>Charlotte</OriginCity><OriginState>NC</OriginState><DestinationCity>Atlanta</DestinationCity><DestinationState>GA</DestinationState><Weight>40000</Weight></MultipleLoadDetailResult>
        <MultipleLoadDetailResult><ID>2</ID><OriginCity>Charlotte</OriginCity><OriginState>NC</OriginState><DestinationCity>Macon</DestinationCity><DestinationState>GA</DestinationState><Weight>48000</Weight></MultipleLoadDetailResult>
        <MultipleLoadDetailResult><ID>3</ID><OriginCity>Charlotte</OriginCity><OriginState>NC</OriginState><DestinationCity>Savannah</DestinationCity><DestinationState>GA</DestinationState></MultipleLoadDetailResult>
      </DetailResults>
    </GetMultipleLoadDetailResultsResult></GetMultipleLoadDetailResultsResponse></Body></Envelope>`,
});

const realFetch = global.fetch;
const baseArgs = { integrationId: 'int-1', username: 'u', password: 'p', originCity: 'Charlotte', originState: 'NC' };

beforeEach(() => { global.fetch = vi.fn().mockResolvedValue(soapWithLoads()); });
afterEach(() => { global.fetch = realFetch; vi.clearAllMocks(); });

describe('fetchTruckstopLoads — #158 max-weight filter', () => {
  it('returns all loads when no max weight is set', async () => {
    const loads = await fetchTruckstopLoads({ ...baseArgs });
    expect(loads.map(l => l.load_id).sort()).toEqual(['1', '2', '3']);
  });

  it('drops loads heavier than the cap, keeps unknown-weight loads', async () => {
    const loads = await fetchTruckstopLoads({ ...baseArgs, maxWeightLbs: 44000 });
    const ids = loads.map(l => l.load_id).sort();
    expect(ids).toContain('1'); // 40000 ≤ 44000
    expect(ids).toContain('3'); // no reported weight → kept
    expect(ids).not.toContain('2'); // 48000 > 44000 → dropped
  });

  it('treats a load exactly at the cap as eligible', async () => {
    const loads = await fetchTruckstopLoads({ ...baseArgs, maxWeightLbs: 40000 });
    expect(loads.map(l => l.load_id)).toContain('1');
  });

  it('ignores a zero/invalid cap (no limit applied)', async () => {
    const loads = await fetchTruckstopLoads({ ...baseArgs, maxWeightLbs: 0 });
    expect(loads).toHaveLength(3);
  });
});

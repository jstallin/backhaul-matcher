/**
 * Unit tests for the Truckstop handler in api/integrations/[provider].js
 *
 * Current model (post-Vault migration, #91 rehab):
 * - Truckstop is connected per-ORG via a single `integration_id`, encrypted in
 *   Supabase Vault and referenced by `org_integrations.integration_id_vault_id`.
 * - There is NO user-level token and NO username/password. Saving takes
 *   `{ integration_id }`, which is validated against Truckstop (SOAP) before being
 *   stored via the `store_ts_integration_id` RPC.
 * - Only org admins may save/disconnect; any member may read connection status.
 *
 * Env vars are injected via vite.config.js test.env; TRUCKSTOP_WS_* are set per-test
 * below so validateTruckstopIntegrationId proceeds to the (mocked) SOAP fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

import handler, { buildPickupDates } from '../integrations/[provider].js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fluent Supabase query chain that resolves to { data, error }.
 * Thenable so `await chain.update().eq().eq()` works without a terminal method.
 */
function q(data, error = null) {
  const result = { data, error };
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

/** Supabase "no rows" (PGRST116) from .single() — treated as null, not an error. */
function qNotFound() {
  return q(null, { code: 'PGRST116', message: 'The result contains 0 rows' });
}

function tsReq(method, opts = {}) {
  return {
    method,
    query:   { provider: 'truckstop', ...(opts.query || {}) },
    body:    opts.body || {},
    headers: { authorization: 'Bearer test-token' },
  };
}

function makeRes() {
  const r = { _status: null, _body: null, setHeader: vi.fn(), end: vi.fn() };
  r.status = vi.fn().mockImplementation(s => { r._status = s; return r; });
  r.json   = vi.fn().mockImplementation(b => { r._body  = b; return r; });
  return r;
}

const MOCK_USER = { id: 'user-123', email: 'jason@acme.com' };
const INTEGRATION_ID = 'TS-INT-123';

// A Truckstop SOAP response the validator reads as "valid" (200, no auth Errors).
const validSoapResponse = () => ({ ok: true, status: 200, text: async () => '<Envelope></Envelope>' });
// 401/Unauthorized → "invalid".
const unauthorizedResponse = () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });

const realFetch = global.fetch;

beforeEach(() => {
  mockSupabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) },
    from: vi.fn(),
    rpc:  vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  // WS creds present → validator proceeds to the (mocked) SOAP fetch instead of
  // short-circuiting to 'unverified'.
  process.env.TRUCKSTOP_WS_USERNAME = 'ws-user';
  process.env.TRUCKSTOP_WS_PASSWORD = 'ws-pass';
  // Default: Truckstop validation succeeds.
  global.fetch = vi.fn().mockResolvedValue(validSoapResponse());
});

afterEach(() => {
  delete process.env.TRUCKSTOP_WS_USERNAME;
  delete process.env.TRUCKSTOP_WS_PASSWORD;
  global.fetch = realFetch;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET — connection status (any org member may read)
// ---------------------------------------------------------------------------

describe('GET /api/integrations/truckstop — connection status', () => {
  it('reports connected (is_org_token:true) when the org has an integration ID in vault', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')  return q({ org_id: 'org-1', role: 'admin' });
      if (table === 'org_integrations') return q({ integration_id_vault_id: 'vault-1', created_at: '2026-01-01' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(true);
    expect(r._body.is_org_token).toBe(true);
    expect(r._body.connected_at).toBe('2026-01-01');
  });

  it('reports not-connected (is_org_token:true) when the org has no integration ID', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')  return q({ org_id: 'org-1', role: 'member' });
      if (table === 'org_integrations') return qNotFound();
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(false);
    expect(r._body.is_org_token).toBe(true);
  });

  it('reports not-connected (is_org_token:false) when the user has no org', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q(null);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(false);
    expect(r._body.is_org_token).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST — save integration ID (org admin only)
// ---------------------------------------------------------------------------

describe('POST /api/integrations/truckstop — save integration ID', () => {
  it('validates then stores the integration ID via RPC for an org admin (200, is_org_token:true)', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(200);
    expect(r._body.is_org_token).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('store_ts_integration_id', {
      p_org_id: 'org-1',
      p_integration_id: INTEGRATION_ID,
    });
  });

  it('returns 403 when caller is an org member (not admin)', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'member' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(403);
    expect(r._body.error).toMatch(/only org admins/i);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when the user has no org', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q(null);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 when integration_id is missing', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: {} }), r);
    expect(r._status).toBe(400);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 (INVALID_INTEGRATION_ID) when Truckstop rejects the ID', async () => {
    global.fetch = vi.fn().mockResolvedValue(unauthorizedResponse());
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(400);
    expect(r._body.code).toBe('INVALID_INTEGRATION_ID');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 503 (VERIFY_FAILED) when validation cannot be performed', async () => {
    // No WS creds → validator returns 'unverified' before any fetch.
    delete process.env.TRUCKSTOP_WS_USERNAME;
    delete process.env.TRUCKSTOP_WS_PASSWORD;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(503);
    expect(r._body.code).toBe('VERIFY_FAILED');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the store RPC fails', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'vault down' } });
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { integration_id: INTEGRATION_ID } }), r);
    expect(r._status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE — disconnect (org admin only)
// ---------------------------------------------------------------------------

describe('DELETE /api/integrations/truckstop — disconnect', () => {
  it('clears the org integration (vault ref → null) and returns success for an org admin', async () => {
    const orgIntChain = q(null);
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')  return q({ org_id: 'org-1', role: 'admin' });
      if (table === 'org_integrations') return orgIntChain;
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
    expect(orgIntChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ integration_id_vault_id: null })
    );
  });

  it('returns 403 when an org member tries to disconnect', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'member' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(403);
    expect(r._body.error).toMatch(/only org admins/i);
  });

  it('returns 400 when the user has no org', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q(null);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// buildPickupDates (#117) — pickup window → PickupDates list
// ---------------------------------------------------------------------------

describe('buildPickupDates (#117)', () => {
  // 18:00 UTC = 13:00 CDT — unambiguous "June 5" in America/Chicago
  const today = new Date('2026-06-05T18:00:00Z');

  it('expands a start→end window into one date per day', () => {
    expect(buildPickupDates('2026-06-08', '2026-06-11', today)).toEqual([
      '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11',
    ]);
  });

  it('clamps a past start up to today and keeps the future remainder of the window', () => {
    expect(buildPickupDates('2026-06-01', '2026-06-07', today)).toEqual([
      '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
  });

  it('returns a single date when there is no end (estimates/WWP) or end ≤ start', () => {
    expect(buildPickupDates('2026-06-08', null, today)).toEqual(['2026-06-08']);
    expect(buildPickupDates('2026-06-08', '2026-06-08', today)).toEqual(['2026-06-08']);
    expect(buildPickupDates('2026-06-08', '2026-06-01', today)).toEqual(['2026-06-08']);
  });

  it('returns today for an empty/past start with no end (prior single-date behavior)', () => {
    expect(buildPickupDates('', null, today)).toEqual(['2026-06-05']);
    expect(buildPickupDates('2026-05-01', null, today)).toEqual(['2026-06-05']);
  });

  it('caps the window at 10 dates', () => {
    const dates = buildPickupDates('2026-06-08', '2026-07-30', today);
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe('2026-06-08');
    expect(dates[9]).toBe('2026-06-17');
  });

  it('computes "today" in Central time, not UTC (the Friday-midnight bug)', () => {
    // Friday 11:59 PM CDT = Saturday 04:59 UTC. UTC "today" would be 06-07 (Sunday);
    // Central "today" is still 06-06 (Saturday)... i.e. the *next morning's* loads
    // stay searchable instead of skipping a day.
    const lateFriday = new Date('2026-06-07T04:59:00Z'); // = 2026-06-06 23:59 CDT
    expect(buildPickupDates('2026-06-04', null, lateFriday)).toEqual(['2026-06-06']);
  });

  it('strips time portions from ISO inputs', () => {
    expect(buildPickupDates('2026-06-08T08:00:00', '2026-06-09T17:00:00', today)).toEqual([
      '2026-06-08', '2026-06-09',
    ]);
  });
});

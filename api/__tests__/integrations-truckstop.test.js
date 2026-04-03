/**
 * Unit tests for the Truckstop handler in api/integrations/[provider].js
 *
 * Focuses on org-aware behavior introduced with the Org model:
 * - Org admins can read/write/delete org-level tokens (stored by org_id)
 * - Org members (non-admin) cannot modify the org token (403)
 * - Users with no org fall back to user-level tokens
 *
 * Env vars are injected via vite.config.js test.env so they're available
 * when the handler module loads its module-level constants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

import handler from '../integrations/[provider].js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fluent Supabase query chain that resolves to { data, error }.
 * The chain is thenable so `await chain.update().eq()` works without needing
 * a terminal method like .single().
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

/**
 * Simulates Supabase's "no rows" error (PGRST116) from .single().
 * The handler checks `if (error && error.code !== 'PGRST116')` — a PGRST116 error
 * means "not found" and is treated as null data, not a real failure.
 */
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

const MOCK_USER      = { id: 'user-123', email: 'jason@acme.com' };
const CREDS          = { api_token: 'ts-api-key', username: 'chip', password: 'secret' };
const ORG_TOKEN_ROW  = { api_token: 'ts-org-token', username: 'org-user', created_at: '2026-01-01' };
const USER_TOKEN_ROW = { is_connected: true, account_email: 'chip@ts.com', connected_at: '2026-01-01' };

beforeEach(() => {
  mockSupabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) },
    from: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// GET — connection status
// ---------------------------------------------------------------------------

describe('GET /api/integrations/truckstop — connection status', () => {
  it('returns org token (is_org_token:true) when user has an org with a Truckstop token', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')  return q({ org_id: 'org-1', role: 'admin' });
      if (table === 'org_integrations') return q(ORG_TOKEN_ROW);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(true);
    expect(r._body.is_org_token).toBe(true);
    expect(r._body.username).toBe('org-user');
  });

  it('falls back to user token when org has no Truckstop integration', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q({ org_id: 'org-1', role: 'member' });
      if (table === 'org_integrations')  return qNotFound(); // no org token (.single() → PGRST116)
      if (table === 'user_integrations') return q(USER_TOKEN_ROW);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(true);
    expect(r._body.is_org_token).toBe(false);
    expect(r._body.username).toBe('chip@ts.com');
  });

  it('returns connected:false when user has an org but neither org nor user token exists', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q({ org_id: 'org-1', role: 'member' });
      if (table === 'org_integrations')  return qNotFound();
      if (table === 'user_integrations') return qNotFound();
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('GET'), r);
    expect(r._status).toBe(200);
    expect(r._body.connected).toBe(false);
  });

  it('returns connected:false when user has no org and no user-level token', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q(null);      // no org
      if (table === 'user_integrations') return qNotFound();
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
// POST — save credentials
// ---------------------------------------------------------------------------

describe('POST /api/integrations/truckstop — save credentials', () => {
  it('saves org-level token and returns is_org_token:true when caller is org admin', async () => {
    const orgIntChain = q(null);
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')  return q({ org_id: 'org-1', role: 'admin' });
      if (table === 'org_integrations') return orgIntChain;
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: CREDS }), r);
    expect(r._status).toBe(200);
    expect(r._body.is_org_token).toBe(true);
    expect(orgIntChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-1', provider: 'truckstop', api_token: 'ts-api-key', username: 'chip' }),
      expect.anything()
    );
  });

  it('returns 403 when caller is an org member (not admin)', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'member' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: CREDS }), r);
    expect(r._status).toBe(403);
    expect(r._body.error).toMatch(/only org admins/i);
  });

  it('saves user-level token and returns is_org_token:false when user has no org', async () => {
    const userIntChain = q(null);
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q(null); // no org
      if (table === 'user_integrations') return userIntChain;
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: CREDS }), r);
    expect(r._status).toBe(200);
    expect(r._body.is_org_token).toBe(false);
    expect(userIntChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: MOCK_USER.id, provider: 'truckstop', access_token: 'ts-api-key' }),
      expect.anything()
    );
  });

  it('returns 400 when api_token is missing', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { username: 'chip', password: 'secret' } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 when username is missing', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { api_token: 'tok', password: 'secret' } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'admin' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('POST', { body: { api_token: 'tok', username: 'chip' } }), r);
    expect(r._status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE — disconnect
// ---------------------------------------------------------------------------

describe('DELETE /api/integrations/truckstop — disconnect', () => {
  it('deletes org-level token and returns success when caller is org admin', async () => {
    const orgIntChain = q(null);
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q({ org_id: 'org-1', role: 'admin' });
      if (table === 'org_integrations')  return orgIntChain;
      if (table === 'user_integrations') return q(null);
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
    expect(orgIntChain.delete).toHaveBeenCalled();
  });

  it('returns 403 when org member tries to disconnect org-level token', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') return q({ org_id: 'org-1', role: 'member' });
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(403);
    expect(r._body.error).toMatch(/only org admins/i);
  });

  it('disconnects user-level token for a user with no org', async () => {
    const userIntChain = q(null);
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships')   return q(null); // no org
      if (table === 'user_integrations') return userIntChain;
      return q(null);
    });
    const r = makeRes();
    await handler(tsReq('DELETE'), r);
    expect(r._status).toBe(200);
    expect(userIntChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_connected: false, access_token: null })
    );
  });
});

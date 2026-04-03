/**
 * Unit tests for api/orgs/[action].js
 *
 * All Supabase and Resend calls are mocked — no network or DB access.
 * Tests cover: auth gates, happy paths, and key error cases for every action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// Env vars (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.) are injected
// via vite.config.js test.env so they're available at module load time.

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: 'email-mock-id' }) }
  }))
}));

let mockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

import handler from '../orgs/[action].js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fluent Supabase query chain that resolves to { data, error }.
 * All methods return `this` for chaining; .single() and .maybeSingle() resolve
 * the promise. The chain itself is thenable so `await chain.update().eq()` works.
 */
function q(data, error = null) {
  const result = { data, error };
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    neq:         vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // Makes the chain itself awaitable (for chains with no terminal method like .single())
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

/** Supabase "no rows" error from .single() — treated as null, not a real failure. */
function qNotFound() {
  return q(null, { code: 'PGRST116', message: 'The result contains 0 rows' });
}

/** Make a mock request object. */
function makeReq(method, action, opts = {}) {
  return {
    method,
    query:   { action, ...(opts.query  || {}) },
    body:    opts.body    || {},
    headers: {
      authorization: opts.noAuth ? undefined : 'Bearer test-token',
      ...(opts.headers || {}),
    },
  };
}

/** Make a mock response object that captures status + body. */
function makeRes() {
  const r = { _status: null, _body: null, setHeader: vi.fn(), end: vi.fn() };
  r.status = vi.fn().mockImplementation(s => { r._status = s; return r; });
  r.json   = vi.fn().mockImplementation(b => { r._body  = b; return r; });
  return r;
}

const MOCK_USER = {
  id: 'user-admin',
  email: 'jason@acme.com', // enterprise domain
  user_metadata: { full_name: 'Jason Admin' },
};

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('/api/orgs — authentication', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }), admin: {} },
      from: vi.fn(() => q(null)),
    };
  });

  it('returns 401 when Authorization header is missing', async () => {
    const r = makeRes();
    await handler(makeReq('GET', 'me', { noAuth: true }), r);
    expect(r._status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } });
    const r = makeRes();
    await handler(makeReq('GET', 'me'), r);
    expect(r._status).toBe(401);
  });

  it('returns 404 for unknown action', async () => {
    const r = makeRes();
    await handler(makeReq('GET', 'nonexistent'), r);
    expect(r._status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orgs/me
// ---------------------------------------------------------------------------

describe('/api/orgs/me', () => {
  const ORG = { id: 'org-1', name: 'Acme Corp', email_domain: 'acme.com', created_at: '2026-01-01' };

  beforeEach(() => {
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }), admin: {} },
      from: vi.fn(),
    };
  });

  it('returns existing org + admin flag when user already has a membership', async () => {
    mockSupabase.from.mockImplementation(() => q({ role: 'admin', orgs: ORG }));
    const r = makeRes();
    await handler(makeReq('GET', 'me'), r);
    expect(r._status).toBe(200);
    expect(r._body.org).toEqual(ORG);
    expect(r._body.is_org_admin).toBe(true);
    expect(r._body.role).toBe('admin');
  });

  it('reports is_org_admin:false for a regular member', async () => {
    mockSupabase.from.mockImplementation(() => q({ role: 'member', orgs: ORG }));
    const r = makeRes();
    await handler(makeReq('GET', 'me'), r);
    expect(r._status).toBe(200);
    expect(r._body.is_org_admin).toBe(false);
  });

  it('returns null org for free-email domain users (no auto-create)', async () => {
    const freeUser = { ...MOCK_USER, email: 'user@gmail.com' };
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: freeUser }, error: null });
    mockSupabase.from.mockImplementation(() => q(null)); // no existing membership
    const r = makeRes();
    await handler(makeReq('GET', 'me'), r);
    expect(r._status).toBe(200);
    expect(r._body.org).toBeNull();
    expect(r._body.is_org_admin).toBe(false);
  });

  it('creates org and makes user admin when they are first with their enterprise domain', async () => {
    const newOrg = { id: 'org-new', name: 'acme.com', email_domain: 'acme.com' };
    let orgMembershipCalls = 0;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') {
        orgMembershipCalls++;
        if (orgMembershipCalls === 1) return q(null); // no existing membership
        return q(null);                               // insert result
      }
      if (table === 'orgs') {
        // First call: no existing org; second call: insert returns new org
        return {
          ...q(null),
          select:  vi.fn().mockReturnThis(),
          eq:      vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null })
                                .mockResolvedValue({ data: newOrg, error: null }),
          insert:  vi.fn().mockReturnThis(),
          single:  vi.fn().mockResolvedValue({ data: newOrg, error: null }),
        };
      }
      return q(null);
    });

    const r = makeRes();
    await handler(makeReq('GET', 'me'), r);
    expect(r._status).toBe(200);
    expect(r._body.role).toBe('admin');
    expect(r._body.is_org_admin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orgs/invite-token (no auth required)
// ---------------------------------------------------------------------------

describe('/api/orgs/invite-token', () => {
  const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();
  const PAST   = new Date(Date.now() - 1 * 86400000).toISOString();

  const noAuthReq = (token) => ({
    method: 'GET',
    query:  { action: 'invite-token', ...(token ? { token } : {}) },
    body:   {},
    headers: {},
  });

  beforeEach(() => {
    mockSupabase = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { user_metadata: { full_name: 'Jason Admin' }, email: 'jason@acme.com' } }
          })
        }
      },
      from: vi.fn(),
    };
  });

  it('returns 400 when token param is missing', async () => {
    const r = makeRes();
    await handler(noAuthReq(null), r);
    expect(r._status).toBe(400);
  });

  it('returns 404 for an unknown token', async () => {
    mockSupabase.from.mockReturnValue(q(null, { code: 'PGRST116', message: 'not found' }));
    const r = makeRes();
    await handler(noAuthReq('bad-token'), r);
    expect(r._status).toBe(404);
  });

  it('returns valid:false + status for an already-accepted invite', async () => {
    const invite = { id: 'i1', status: 'accepted', token: 't1', org_id: 'org-1', invited_by: 'u1',
                     expires_at: FUTURE, orgs: { name: 'Acme Corp' } };
    mockSupabase.from.mockReturnValue(q(invite));
    const r = makeRes();
    await handler(noAuthReq('t1'), r);
    expect(r._status).toBe(200);
    expect(r._body.valid).toBe(false);
    expect(r._body.status).toBe('accepted');
    expect(r._body.org_name).toBe('Acme Corp');
  });

  it('returns valid:true with org_name, inviter_name, and email for a good pending invite', async () => {
    const invite = { id: 'i2', status: 'pending', token: 't2', org_id: 'org-1', invited_by: 'u1',
                     email: 'chip@acme.com', expires_at: FUTURE, orgs: { name: 'Acme Corp' } };
    mockSupabase.from.mockReturnValue(q(invite));
    const r = makeRes();
    await handler(noAuthReq('t2'), r);
    expect(r._status).toBe(200);
    expect(r._body.valid).toBe(true);
    expect(r._body.org_name).toBe('Acme Corp');
    expect(r._body.inviter_name).toBe('Jason Admin');
    expect(r._body.email).toBe('chip@acme.com');
  });

  it('marks invite expired and returns valid:false when past the expiry date', async () => {
    const invite = { id: 'i3', status: 'pending', token: 't3', org_id: 'org-1', invited_by: 'u1',
                     email: 'chip@acme.com', expires_at: PAST, orgs: { name: 'Acme Corp' } };
    const fromChain = q(invite);
    mockSupabase.from.mockReturnValue(fromChain);
    const r = makeRes();
    await handler(noAuthReq('t3'), r);
    expect(r._status).toBe(200);
    expect(r._body.valid).toBe(false);
    expect(r._body.status).toBe('expired');
    expect(fromChain.update).toHaveBeenCalledWith({ status: 'expired' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/orgs/respond
// ---------------------------------------------------------------------------

describe('/api/orgs/respond', () => {
  const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();
  const CHIP_USER = { id: 'chip-id', email: 'chip@acme.com' };
  const INVITE = {
    id: 'inv-1', status: 'pending', token: 'tok-1', org_id: 'org-1', invited_by: 'user-admin',
    email: 'chip@acme.com', expires_at: FUTURE, orgs: { name: 'Acme Corp' }
  };

  beforeEach(() => {
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: CHIP_USER }, error: null }), admin: {} },
      from: vi.fn(),
    };
  });

  it('returns 400 when token is missing', async () => {
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { action: 'accept' } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 for an invalid action value', async () => {
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { token: 'tok-1', action: 'approve' } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 when invite is already accepted', async () => {
    mockSupabase.from.mockReturnValue(q({ ...INVITE, status: 'accepted' }));
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { token: 'tok-1', action: 'accept' } }), r);
    expect(r._status).toBe(400);
    expect(r._body.error).toMatch(/already accepted/i);
  });

  it('returns 403 when logged-in user email does not match invite email', async () => {
    const wrongUser = { id: 'wrong-id', email: 'notchip@acme.com' };
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: wrongUser }, error: null });
    mockSupabase.from.mockReturnValue(q(INVITE));
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { token: 'tok-1', action: 'accept' } }), r);
    expect(r._status).toBe(403);
  });

  it('accepts invite, inserts membership, and returns action:accepted', async () => {
    let orgMembershipCalls = 0;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_invites') return q(INVITE);
      if (table === 'org_memberships') {
        orgMembershipCalls++;
        return orgMembershipCalls === 1 ? q(null) : q(null); // not a member; insert succeeds
      }
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { token: 'tok-1', action: 'accept' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.action).toBe('accepted');
    expect(r._body.org_name).toBe('Acme Corp');
  });

  it('declines invite and returns action:declined', async () => {
    mockSupabase.from.mockReturnValue(q(INVITE));
    const r = makeRes();
    await handler(makeReq('POST', 'respond', { body: { token: 'tok-1', action: 'decline' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.action).toBe('declined');
  });
});

// ---------------------------------------------------------------------------
// POST /api/orgs/invite
// ---------------------------------------------------------------------------

describe('/api/orgs/invite', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        admin: {
          listUsers:           vi.fn().mockResolvedValue({ data: { users: [] } }),
          inviteUserByEmail:   vi.fn().mockResolvedValue({ data: {}, error: null }),
        }
      },
      from: vi.fn(),
    };
  });

  it('returns 400 when email is missing', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'admin', org_id: 'org-1', orgs: { name: 'Acme' } }));
    const r = makeRes();
    await handler(makeReq('POST', 'invite', { body: {} }), r);
    expect(r._status).toBe(400);
  });

  it('returns 403 when caller is a member (not admin)', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'member', org_id: 'org-1', orgs: { name: 'Acme' } }));
    const r = makeRes();
    await handler(makeReq('POST', 'invite', { body: { email: 'chip@acme.com' } }), r);
    expect(r._status).toBe(403);
  });

  it('returns 403 when caller has no org membership at all', async () => {
    mockSupabase.from.mockReturnValue(q(null));
    const r = makeRes();
    await handler(makeReq('POST', 'invite', { body: { email: 'chip@acme.com' } }), r);
    expect(r._status).toBe(403);
  });

  it('returns 400 when a pending invite already exists for that email', async () => {
    let orgMembershipCalls = 0;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') {
        orgMembershipCalls++;
        return q(orgMembershipCalls === 1
          ? { role: 'admin', org_id: 'org-1', orgs: { name: 'Acme Corp' } }
          : null
        );
      }
      if (table === 'org_invites') return q({ id: 'existing', status: 'pending' });
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('POST', 'invite', { body: { email: 'chip@acme.com' } }), r);
    expect(r._status).toBe(400);
    expect(r._body.error).toMatch(/pending invite/i);
  });

  it('creates invite and returns success for a valid org admin invite', async () => {
    const createdInvite = {
      id: 'inv-new', token: 'new-token',
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
    };
    let callsByTable = {};
    mockSupabase.from.mockImplementation((table) => {
      callsByTable[table] = (callsByTable[table] || 0) + 1;
      if (table === 'org_memberships') {
        return callsByTable[table] === 1
          ? q({ role: 'admin', org_id: 'org-1', orgs: { name: 'Acme Corp' } })
          : q(null);
      }
      if (table === 'org_invites') {
        if (callsByTable[table] === 1) return q(null); // no duplicate
        return q(createdInvite);                       // insert result
      }
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('POST', 'invite', { body: { email: 'newuser@acme.com' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
    expect(r._body.message).toMatch(/invite sent/i);
  });
});

// ---------------------------------------------------------------------------
// GET /DELETE /api/orgs/members
// ---------------------------------------------------------------------------

describe('/api/orgs/members — GET', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                { id: 'user-admin', email: 'jason@acme.com', user_metadata: { full_name: 'Jason' }, last_sign_in_at: null },
                { id: 'chip-id',   email: 'chip@acme.com',  user_metadata: { full_name: 'Chip'  }, last_sign_in_at: null },
              ]
            }
          })
        }
      },
      from: vi.fn(),
    };
  });

  it('returns 403 when caller is not an org admin', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'member', org_id: 'org-1' }));
    const r = makeRes();
    await handler(makeReq('GET', 'members'), r);
    expect(r._status).toBe(403);
  });

  it('returns enriched member list for org admin', async () => {
    let orgMembershipCalls = 0;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') {
        orgMembershipCalls++;
        if (orgMembershipCalls === 1) return q({ role: 'admin', org_id: 'org-1' }); // auth check
        // Member list — terminated by .order()
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          order:  vi.fn().mockResolvedValue({
            data: [
              { id: 'm1', role: 'admin',  user_id: 'user-admin', created_at: '2026-01-01' },
              { id: 'm2', role: 'member', user_id: 'chip-id',    created_at: '2026-02-01' },
            ],
            error: null
          }),
        };
      }
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('GET', 'members'), r);
    expect(r._status).toBe(200);
    expect(r._body.members).toHaveLength(2);
    expect(r._body.members[0].email).toBe('jason@acme.com');
    expect(r._body.members[0].full_name).toBe('Jason');
    expect(r._body.members[1].email).toBe('chip@acme.com');
  });
});

describe('/api/orgs/members — DELETE', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }), admin: {} },
      from: vi.fn(),
    };
  });

  it('returns 403 when caller is not an org admin', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'member', org_id: 'org-1' }));
    const r = makeRes();
    await handler(makeReq('DELETE', 'members', { body: { userId: 'chip-id' } }), r);
    expect(r._status).toBe(403);
  });

  it('returns 400 when trying to remove yourself', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'admin', org_id: 'org-1' }));
    const r = makeRes();
    await handler(makeReq('DELETE', 'members', { body: { userId: MOCK_USER.id } }), r);
    expect(r._status).toBe(400);
    expect(r._body.error).toMatch(/cannot remove yourself/i);
  });

  it('returns 400 when userId is missing', async () => {
    mockSupabase.from.mockReturnValue(q({ role: 'admin', org_id: 'org-1' }));
    const r = makeRes();
    await handler(makeReq('DELETE', 'members', { body: {} }), r);
    expect(r._status).toBe(400);
  });

  it('removes member and returns success for org admin', async () => {
    let orgMembershipCalls = 0;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'org_memberships') {
        orgMembershipCalls++;
        return orgMembershipCalls === 1 ? q({ role: 'admin', org_id: 'org-1' }) : q(null);
      }
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('DELETE', 'members', { body: { userId: 'chip-id' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orgs/role (app admin only)
// ---------------------------------------------------------------------------

describe('/api/orgs/role', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }), admin: {} },
      from: vi.fn(),
    };
  });

  it('returns 403 when caller is not an app admin', async () => {
    mockSupabase.from.mockReturnValue(q(null)); // no admin_users row
    const r = makeRes();
    await handler(makeReq('POST', 'role', { body: { userId: 'u2', orgId: 'org-1', role: 'admin' } }), r);
    expect(r._status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    mockSupabase.from.mockReturnValue(q({ user_id: MOCK_USER.id })); // is app admin
    const r = makeRes();
    await handler(makeReq('POST', 'role', { body: { orgId: 'org-1', role: 'admin' } }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 for invalid role value', async () => {
    mockSupabase.from.mockReturnValue(q({ user_id: MOCK_USER.id })); // is app admin
    const r = makeRes();
    await handler(makeReq('POST', 'role', { body: { userId: 'u2', orgId: 'org-1', role: 'superuser' } }), r);
    expect(r._status).toBe(400);
  });

  it('promotes a member to admin when called by app admin', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'admin_users')    return q({ user_id: MOCK_USER.id });
      if (table === 'org_memberships') return q(null); // update result
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('POST', 'role', { body: { userId: 'chip-id', orgId: 'org-1', role: 'admin' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
  });

  it('demotes an admin to member when called by app admin', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'admin_users')    return q({ user_id: MOCK_USER.id });
      if (table === 'org_memberships') return q(null);
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('POST', 'role', { body: { userId: 'chip-id', orgId: 'org-1', role: 'member' } }), r);
    expect(r._status).toBe(200);
    expect(r._body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orgs/all (app admin only)
// ---------------------------------------------------------------------------

describe('/api/orgs/all', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                { id: 'user-admin', email: 'jason@acme.com', user_metadata: { full_name: 'Jason' } },
                { id: 'chip-id',   email: 'chip@acme.com',  user_metadata: { full_name: 'Chip'  } },
              ]
            }
          })
        }
      },
      from: vi.fn(),
    };
  });

  it('returns 403 for non-app-admin', async () => {
    mockSupabase.from.mockReturnValue(q(null));
    const r = makeRes();
    await handler(makeReq('GET', 'all'), r);
    expect(r._status).toBe(403);
  });

  it('returns enriched org list with member details for app admin', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'admin_users') return q({ user_id: MOCK_USER.id });
      if (table === 'orgs') {
        return {
          select: vi.fn().mockReturnThis(),
          order:  vi.fn().mockResolvedValue({
            data: [{
              id: 'org-1', name: 'Acme Corp', email_domain: 'acme.com', created_at: '2026-01-01',
              org_memberships: [
                { id: 'm1', user_id: 'user-admin', role: 'admin'  },
                { id: 'm2', user_id: 'chip-id',   role: 'member' },
              ]
            }],
            error: null
          }),
        };
      }
      return q(null);
    });
    const r = makeRes();
    await handler(makeReq('GET', 'all'), r);
    expect(r._status).toBe(200);
    expect(r._body.orgs).toHaveLength(1);
    expect(r._body.orgs[0].member_count).toBe(2);
    expect(r._body.orgs[0].members[0].email).toBe('jason@acme.com');
    expect(r._body.orgs[0].members[0].role).toBe('admin');
    expect(r._body.orgs[0].members[1].full_name).toBe('Chip');
  });
});

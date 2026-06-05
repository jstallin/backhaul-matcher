/**
 * #87: the api/pcmiler/* JSON proxies spend the billed PCMILER_API_KEY, so they
 * must reject requests without a valid Supabase session. These tests pin the auth
 * gate on the route handler (geocode/routepath share the identical gate).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable mock getUser shared with the module-level createClient() the handler runs at import.
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

import routeHandler from '../pcmiler/route.js';

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

const validStops = { stops: '-85.0,38.0;-82.0,36.0', reports: 'Mileage' };

describe('pcmiler/route auth gate (#87)', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it('returns 401 and never validates a token when no Authorization header is present', async () => {
    const res = mockRes();
    await routeHandler({ headers: {}, query: validStops }, res);
    expect(res.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token does not resolve to a user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = mockRes();
    await routeHandler({ headers: { authorization: 'Bearer not-a-real-token' }, query: validStops }, res);
    expect(res.statusCode).toBe(401);
    expect(mockGetUser).toHaveBeenCalledWith('not-a-real-token');
  });
});

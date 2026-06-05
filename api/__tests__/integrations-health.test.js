/**
 * The integrations health endpoint must be public (no auth — uptime monitors are
 * anonymous) and must not make a Truckstop call. It reports only whether the Truckstop
 * WS credentials are configured.
 */
import { describe, it, expect, afterEach } from 'vitest';
import handler from '../integrations/health.js';

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

// No Authorization header — proves the endpoint does not require auth.
const anonReq = { method: 'GET', headers: {}, query: {} };

describe('integrations/health', () => {
  const origUser = process.env.TRUCKSTOP_WS_USERNAME;
  const origPass = process.env.TRUCKSTOP_WS_PASSWORD;
  afterEach(() => {
    if (origUser === undefined) delete process.env.TRUCKSTOP_WS_USERNAME; else process.env.TRUCKSTOP_WS_USERNAME = origUser;
    if (origPass === undefined) delete process.env.TRUCKSTOP_WS_PASSWORD; else process.env.TRUCKSTOP_WS_PASSWORD = origPass;
  });

  it('returns 200 / ok:true when the Truckstop WS creds are set, with no auth header', () => {
    process.env.TRUCKSTOP_WS_USERNAME = 'ws-user';
    process.env.TRUCKSTOP_WS_PASSWORD = 'ws-pass';
    const res = mockRes();
    handler(anonReq, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.truckstop_ws_configured).toBe(true);
  });

  it('returns 503 / ok:false when WS creds are missing', () => {
    delete process.env.TRUCKSTOP_WS_USERNAME;
    delete process.env.TRUCKSTOP_WS_PASSWORD;
    const res = mockRes();
    handler(anonReq, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

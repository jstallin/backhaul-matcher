/**
 * The PC*MILER health endpoint must be public (no auth — uptime monitors are anonymous)
 * and must not call PC*MILER. It reports only whether the key is configured.
 */
import { describe, it, expect, afterEach } from 'vitest';
import handler from '../pcmiler/health.js';

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

describe('pcmiler/health', () => {
  const original = process.env.PCMILER_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.PCMILER_API_KEY;
    else process.env.PCMILER_API_KEY = original;
  });

  it('returns 200 / ok:true when the PC*MILER key is configured, with no auth header', () => {
    process.env.PCMILER_API_KEY = 'test-key';
    const res = mockRes();
    handler(anonReq, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns 503 / ok:false when the key is missing', () => {
    delete process.env.PCMILER_API_KEY;
    const res = mockRes();
    handler(anonReq, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

/**
 * PC*MILER proxy health check — public, unauthenticated, zero-cost.
 *
 * Purpose: give uptime monitors a stable "the PC*MILER proxy is alive" signal.
 * The real proxies (route / routepath / geocode) now require a valid session (#87),
 * so pointing a monitor at them returns 401. This endpoint instead confirms the proxy
 * function is deployed and configured — WITHOUT calling the billed PC*MILER API (which
 * would spend quota on every uptime check) and WITHOUT requiring auth.
 *
 * Exposes no secrets: only whether the server-side PCMILER_API_KEY env var is present.
 *   200 { ok: true }  — function deployed + key configured
 *   503 { ok: false } — key missing (the proxy genuinely can't work)
 */
export default function handler(req, res) {
  const configured = !!process.env.PCMILER_API_KEY;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(configured ? 200 : 503).json({
    ok: configured,
    service: 'pcmiler-proxy',
    configured,
  });
}

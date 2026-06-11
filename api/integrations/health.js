/**
 * Integrations health check — public, unauthenticated, zero-cost.
 *
 * Mirrors /api/pcmiler/health. Gives uptime monitors a stable signal without pointing
 * at the gated /api/integrations/truckstop endpoint (which requires a session → 401 for
 * an anonymous monitor) and without making a live Truckstop SOAP call (which would spend
 * quota on every ping). Confirms the integration function is deployed and the Truckstop
 * WS credentials are configured. Exposes no secrets — only a configured boolean.
 *
 *   200 { ok: true }  — function deployed + Truckstop WS credentials present
 *   503 { ok: false } — WS credentials missing (the integration genuinely can't work)
 *
 * NOTE: a static `health.js` takes routing precedence over the dynamic `[provider].js`,
 * so this does not collide with /api/integrations/truckstop.
 */
export default function handler(req, res) {
  const truckstopConfigured = !!(process.env.TRUCKSTOP_WS_USERNAME && process.env.TRUCKSTOP_WS_PASSWORD);
  // #146 diag: the resolved Truckstop base URL — a public API hostname, NOT a secret.
  // Reveals whether the lambda sees TRUCKSTOP_BASE_URL=webservices (prod) or falls back
  // to the testws sandbox default (which returns the 9,999,999,999 sentinel loads). Lets
  // us confirm the env var from an unauthenticated curl. Remove once prod is confirmed.
  const tsBaseUrl = process.env.TRUCKSTOP_BASE_URL || 'https://testws.truckstop.com';
  res.setHeader('Cache-Control', 'no-store');
  return res.status(truckstopConfigured ? 200 : 503).json({
    ok: truckstopConfigured,
    service: 'integrations',
    truckstop_ws_configured: truckstopConfigured,
    truckstop_base_url: tsBaseUrl,
    truckstop_endpoint_mode: tsBaseUrl.includes('testws') ? 'test' : 'live',
  });
}

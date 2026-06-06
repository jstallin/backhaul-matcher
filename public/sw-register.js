// Service worker (issue #34): register, force an update check on every launch,
// and auto-reload once a new worker takes control so deploys never go stale.
// This also lets the corrected (non-caching) SW replace the old aggressive-
// caching worker still living on some installed devices.
// Externalized from app.html (#94) so the CSP can drop script-src 'unsafe-inline'.
if ('serviceWorker' in navigator) {
  // Only reload when an EXISTING controller is replaced (a real update / the old
  // caching SW being swapped out) — not on a brand-new first install, which would
  // just flash a needless reload.
  var hadController = !!navigator.serviceWorker.controller;
  var reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

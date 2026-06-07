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
  var swReg = null;
  var lastUpdateCheck = 0;
  var checkForUpdate = function () {
    if (!swReg) return;
    var now = Date.now();
    if (now - lastUpdateCheck < 60000) return; // at most once a minute
    lastUpdateCheck = now;
    swReg.update().catch(() => {});
  };

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => { swReg = reg; lastUpdateCheck = Date.now(); return reg.update(); })
      .catch(() => {});
  });

  // #120: an installed (home-screen) PWA is resumed from a snapshot, not reloaded —
  // the load event never refires, so a long-lived instance would stay on a stale
  // bundle across deploys. Re-check whenever the app returns to the foreground;
  // the controllerchange handler above reloads once a new worker takes over.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) checkForUpdate(); // bfcache restore
  });
}

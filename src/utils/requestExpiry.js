// Issue #83: a backhaul/estimate request whose pickup window is fully in the
// past is Inactive/Expired — it can't be run (manually or by the auto-refresh
// cron) until the user edits the dates forward. The state is DERIVED from
// equipment_needed_date, never stored, so editing the date re-enables the
// request immediately with no other steps.
//
// Rules (decided on the issue):
// - Expired = equipment_needed_date < today (local calendar day).
// - No end date → never expires (open-ended window).
// - Strictly end-date driven; effectivePickupDate() clamping is unrelated.
//
// Also imported by api/cron/refresh-requests.js (server-side) — keep this
// module dependency-free.

// Local calendar day as 'YYYY-MM-DD' (en-CA locale formats exactly that).
const localToday = () => new Date().toLocaleDateString('en-CA');

export function isRequestExpired(request) {
  const end = request?.equipment_needed_date;
  if (!end) return false; // open-ended window never expires
  // Date-only string compare avoids UTC-midnight timezone shifts.
  return String(end).slice(0, 10) < localToday();
}

export const EXPIRED_HINT = 'Pickup window has passed — edit the dates to search again';

// Quiet hours for notifications — suppress sends outside the recipient's local
// daytime window (a 2:30 AM "lane softening" alert prompted this). BOTH channels
// are gated; the change is still detected, charged, and visible in-app, so only
// the delivery is withheld. The 8 AM–9 PM window also matches CTIA/TCPA SMS
// guidance, so it doubles as compliance hygiene.
//
// Dependency-free (Intl only) so api/ functions can import it server-side under
// native ESM (explicit .js extension at the call site).

export const NOTIFY_START_HOUR = 8;   // 8 AM, inclusive
export const NOTIFY_END_HOUR = 21;    // 9 PM, exclusive
export const DEFAULT_TZ = 'America/New_York';

// Coarse continental-US IANA timezone from longitude. Zone boundaries zigzag
// through states, so this can be ~1hr off near an edge — but a 1-hour shift of an
// 8 AM–9 PM window never reaches the middle of the night, which is the entire
// point. DST is handled correctly downstream via Intl with the IANA zone. Lat is
// only used for a rough AK/HI guard. Falls back to Eastern when coords are missing.
export function usTimeZoneFromCoords(lng, lat) {
  const x = Number(lng);
  if (!Number.isFinite(x)) return DEFAULT_TZ;
  const y = Number(lat);
  if (Number.isFinite(y) && y > 50 && x < -129) return 'America/Anchorage';
  if (x < -140) return 'Pacific/Honolulu';
  if (x < -114) return 'America/Los_Angeles';
  if (x < -100) return 'America/Denver';
  if (x < -85)  return 'America/Chicago';
  return 'America/New_York';
}

// Local clock hour (0–23) for `date` in the given IANA timezone (DST-correct).
export function localHourInZone(date, timeZone) {
  const s = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(date);
  return parseInt(s, 10) % 24; // some locales render midnight as '24'
}

// True when `date` falls within the notify window for the timezone.
export function isWithinNotifyWindow(date, timeZone) {
  const h = localHourInZone(date, timeZone || DEFAULT_TZ);
  return h >= NOTIFY_START_HOUR && h < NOTIFY_END_HOUR;
}

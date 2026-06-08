// #128: auto-generate a backhaul request name when the user leaves the field blank.
// Format: "<display name> — <location> — <date>". If that collides with a name the
// user already has, swap the date for a full timestamp (second-granularity, so it's
// effectively unique). Pure + `now`-injectable for testing.

const two = (n) => String(n).padStart(2, '0');

const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

const fmtTimestamp = (d) =>
  `${fmtDate(d)} ${d.getHours() % 12 || 12}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;

const compose = (who, where, when) => [who, where, when].filter(Boolean).join(' — ');

/**
 * @param {object} args
 * @param {string} args.displayName - user's full name (falls back to 'Backhaul' if blank)
 * @param {string} args.location    - pick-up location text, e.g. "Charlotte, NC"
 * @param {string[]} [args.existingNames] - the user's current request names, for the uniqueness check
 * @param {Date} [args.now] - injectable clock
 * @returns {string}
 */
export function generateRequestName({ displayName, location, existingNames = [], now = new Date() }) {
  const who = (displayName || '').trim() || 'Backhaul';
  const where = (location || '').trim();
  const taken = new Set((existingNames || []).map((n) => (n || '').trim().toLowerCase()));

  const base = compose(who, where, fmtDate(now));
  if (!taken.has(base.toLowerCase())) return base;
  // Non-unique → use a timestamp instead of the date.
  return compose(who, where, fmtTimestamp(now));
}

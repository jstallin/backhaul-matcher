// US phone helpers — shared by the Fleet form (live display formatting) and the SMS
// send paths (E.164 normalization for Twilio). Dependency-free so api/ functions can
// import it server-side under native ESM (explicit .js extension at the call site).
//
// Scope is US (+1) — our users are US fleet operators. An already-international value
// (leading '+') is passed through untouched rather than guessed at.

// Normalize a US phone to E.164 (+1XXXXXXXXXX) for Twilio's `to`. Returns null when the
// input can't be resolved to a valid number — callers skip the send rather than throw,
// so one bad number can't crash a refresh batch. Twilio rejects non-E.164 with err 21211.
export function toE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;                       // 9803229425 → +19803229425
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`; // 19803229425 → +19803229425
  if (String(raw).trim().startsWith('+') && /^\+\d{8,15}$/.test(`+${digits}`)) return `+${digits}`;
  return null;
}

// Progressive display formatting for a US number as the user types: 9803229425 →
// "(980) 322-9425". Re-derived from digits each call, so backspacing works. Leaves an
// already-international (leading '+') value alone. Caps at 10 US digits.
export function formatUsPhone(raw) {
  if (raw == null) return '';
  const s = String(raw);
  if (s.trim().startsWith('+')) return s;
  const d = s.replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

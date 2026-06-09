// #140 (A2P compliance): every outbound SMS must identify the business and remind
// recipients how to opt out. Applied at each Twilio send chokepoint (cron, notifications
// API, load-share) so no message can go out unbranded. Idempotent — won't double-brand
// or duplicate the STOP line for content that already includes them.
const BRAND = 'Haul Monitor';
const OPT_OUT = 'Reply STOP to opt out, HELP for help.';

export function brandSms(body) {
  let msg = String(body ?? '').trim();
  if (!new RegExp(BRAND, 'i').test(msg)) msg = `${BRAND}: ${msg}`;
  if (!/\bSTOP\b/i.test(msg)) msg = `${msg.replace(/\s+$/, '')} ${OPT_OUT}`;
  return msg;
}

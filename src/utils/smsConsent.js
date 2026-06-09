// #140: SMS opt-in consent — single source of truth shared by v1 + v2 request
// forms and buildRequestPayload. SMS is optional (Email always available) and
// consent is explicit + standalone (a dedicated checkbox), so Twilio toll-free
// verification passes (rejection codes 30475 "consent bundled" / 30513 "consent
// required for service").

// Notification methods that include a text message.
export function methodIncludesText(method) {
  return method === 'text' || method === 'both';
}

// True when the user's choices mean we'd send SMS — i.e. consent is required
// before saving. (Notifications on AND a text-inclusive method.)
export function smsConsentRequired(notificationEnabled, method) {
  return !!notificationEnabled && methodIncludesText(method);
}

// Send-time gate: strip the text channel when SMS consent wasn't recorded for the
// request. 'both' → 'email' (still notify by email), 'text' → null (send nothing).
// Used by the cron + client-side change notifications so SMS never goes without consent.
export function effectiveNotificationMethod(method, smsConsent) {
  if (smsConsent) return method || 'email';
  if (method === 'both') return 'email';
  if (method === 'text') return null;
  return method || 'email';
}

// The consent columns to persist on the request. Records a real grant (true +
// timestamp) only when SMS is actually being requested AND the box is checked;
// otherwise clears it. `now` is injectable for testing.
export function consentFieldsFor({ notificationEnabled, method, consentChecked, now = new Date() }) {
  const granted = smsConsentRequired(notificationEnabled, method) && !!consentChecked;
  return {
    sms_consent: granted,
    sms_consent_at: granted ? now.toISOString() : null,
  };
}

-- #140: per-request SMS opt-in consent audit trail (Twilio toll-free verification).
-- SMS is optional and consent is explicit + standalone — the request form's
-- dedicated consent checkbox sets these. No backfill: existing requests have no
-- valid recorded consent, so they must re-opt-in on next edit (the UI shows the
-- box unchecked), and the server send-gate won't text them until sms_consent=true.
ALTER TABLE public.backhaul_requests
  ADD COLUMN IF NOT EXISTS sms_consent    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;

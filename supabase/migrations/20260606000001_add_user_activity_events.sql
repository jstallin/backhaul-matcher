-- Issue #85: lightweight activity telemetry for the admin Org Activity panel.
-- One extensible events table instead of scattered timestamp columns:
-- "last X" = max(created_at) filtered by event_type. Current event types:
--   search_run       (metadata.kind = 'backhaul' | 'estimate')
--   load_detail_open (metadata.load_id / source)
-- load_shares (#82) remains its own table and is read alongside where needed.
CREATE TABLE public.user_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,  -- optional; admin rollups join org_memberships
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin aggregation reads "latest per user per type" — keep that path indexed.
CREATE INDEX user_activity_events_user_type_created_idx
  ON public.user_activity_events (user_id, event_type, created_at DESC);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

-- Users write/read their own events; the admin panel reads cross-user via the
-- service role in /api/orgs (existing admin_users gate).
CREATE POLICY "Users manage own activity events" ON public.user_activity_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

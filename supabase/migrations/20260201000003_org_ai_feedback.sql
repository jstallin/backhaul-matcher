-- AI load analysis feedback
-- Stores thumbs up/down ratings and optional comments on Ask AI responses.
-- Used for Phase 2: injecting org-level preference signals into AI prompts.

CREATE TABLE IF NOT EXISTS org_ai_feedback (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID,
  fleet_id    UUID         REFERENCES fleets(id) ON DELETE SET NULL,
  load_id     TEXT         NOT NULL,
  rating      TEXT         NOT NULL CHECK (rating IN ('up', 'down')),
  comment     TEXT,
  analysis    TEXT,
  load_data   JSONB,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Only the owning user can read their org's feedback.
-- Service role key (used by the API endpoint) bypasses RLS.
ALTER TABLE org_ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own feedback"
  ON org_ai_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Add AI preference profile columns to fleet_profiles.
-- Populated daily by the update-diesel-prices cron job (summarizeOrgPreferences).
-- Used by analyze-load.js to inject org-specific context into AI prompts.

ALTER TABLE fleet_profiles
  ADD COLUMN IF NOT EXISTS ai_preference_profile    TEXT,
  ADD COLUMN IF NOT EXISTS ai_profile_updated_at    TIMESTAMPTZ;

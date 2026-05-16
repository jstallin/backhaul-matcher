-- ============================================================
-- Admin settings table  (key/value store for system-wide flags)
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admin_users members can read or write
CREATE POLICY "admin_settings select"
  ON admin_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admin_settings insert"
  ON admin_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admin_settings update"
  ON admin_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- Seed defaults
INSERT INTO admin_settings (key, value)
VALUES ('dat_debug_email', '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;

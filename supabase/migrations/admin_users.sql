-- ============================================================
-- Admin users table
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users can only see their own row (just enough to check membership)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin users can read own row"
  ON admin_users FOR SELECT USING (auth.uid() = user_id);

-- To grant admin to a user, run:
-- INSERT INTO admin_users (user_id) VALUES ('<user-uuid>');
--
-- Find your user UUID in Supabase → Authentication → Users

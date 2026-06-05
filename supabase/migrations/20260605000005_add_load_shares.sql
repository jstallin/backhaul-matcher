-- Issue #82: track every load share (Email / Text / Copy) from the detail view.
-- Inserts come from api/loads/share.js using the service role (user_id taken from
-- the verified JWT); the RLS policy lets users read their own share history.
CREATE TABLE public.load_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  load_id TEXT,                -- source_load_id / load_id from the load board
  load_source TEXT,            -- e.g. 'truckstop', 'directfreight'
  channel TEXT NOT NULL CHECK (channel IN ('email', 'text', 'copy')),
  recipient TEXT,              -- email address or E.164 phone; NULL for copy
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.load_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own load shares" ON public.load_shares
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

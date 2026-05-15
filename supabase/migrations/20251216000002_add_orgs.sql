-- Migration: Add orgs, org_memberships, org_invites tables
-- and migrate org_integrations from email_domain to org_id

-- ── 1. orgs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email_domain TEXT,    -- used for auto-assignment on signup; nullable
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_domain)
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- NOTE: The RLS policy for orgs references org_memberships,
-- so it is added AFTER org_memberships is created below.

-- ── 2. org_memberships ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON org_memberships(org_id);

ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

-- Users can read their own membership row
CREATE POLICY "Users can view their own org membership"
  ON org_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- Org admins can read all memberships in their org (needed for member list in Settings)
CREATE POLICY "Org admins can view all memberships in their org"
  ON org_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships om2
      WHERE om2.org_id = org_memberships.org_id
      AND om2.user_id = auth.uid()
      AND om2.role = 'admin'
    )
  );

-- Members can read their own org (needed for client-side join in AuthContext)
-- Placed here because it references org_memberships which now exists.
CREATE POLICY "Members can view their org"
  ON orgs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE org_memberships.org_id = orgs.id
      AND org_memberships.user_id = auth.uid()
    )
  );

-- ── 3. org_invites ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  email TEXT NOT NULL,
  token UUID DEFAULT gen_random_uuid() NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined' | 'expired'
  is_new_user BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  responded_at TIMESTAMPTZ,
  UNIQUE(token)
);

CREATE INDEX IF NOT EXISTS idx_org_invites_token ON org_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites(email);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
-- All mutations via service role API routes — no client-side policies needed

-- ── 4. Migrate org_integrations: email_domain → org_id ───────────────────────
-- NOTE: If org_integrations has existing rows, they will be deleted by the
-- column drop. Safe to run if the table is empty (as expected at this stage).
-- If rows exist, run: TRUNCATE TABLE org_integrations; first.

ALTER TABLE org_integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id) ON DELETE CASCADE;

ALTER TABLE org_integrations
  DROP CONSTRAINT IF EXISTS org_integrations_email_domain_provider_key;

ALTER TABLE org_integrations
  DROP COLUMN IF EXISTS email_domain;

ALTER TABLE org_integrations
  ADD CONSTRAINT org_integrations_org_id_provider_key UNIQUE (org_id, provider);

-- Make org_id required (run after ensuring no null rows remain):
ALTER TABLE org_integrations ALTER COLUMN org_id SET NOT NULL;

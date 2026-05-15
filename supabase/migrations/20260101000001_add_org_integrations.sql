-- Migration: Add org_integrations table for shared organization-level API tokens
-- Allows users with the same non-generic email domain (e.g. aimntls.com) to share
-- a single integration token across their entire organization.

CREATE TABLE IF NOT EXISTS org_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_domain TEXT NOT NULL,         -- e.g. 'aimntls.com'
  provider TEXT NOT NULL,             -- 'truckstop', etc.
  api_token TEXT,                     -- The shared API token
  username TEXT,                      -- Login username/email for the provider account
  password TEXT,                      -- Login password for the provider account
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(email_domain, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_integrations_domain ON org_integrations(email_domain);
CREATE INDEX IF NOT EXISTS idx_org_integrations_provider ON org_integrations(provider);

-- Enable Row Level Security
ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (all client access goes through API routes with service key)
-- No anon/authenticated policies needed since API routes use SUPABASE_SERVICE_ROLE_KEY

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_org_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_integrations_updated_at
  BEFORE UPDATE ON org_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_org_integrations_updated_at();

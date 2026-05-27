-- Add vault-reference column to org_integrations for per-org Truckstop integration ID
ALTER TABLE org_integrations
  ADD COLUMN IF NOT EXISTS integration_id_vault_id UUID;

-- Track whether org admin has completed the Truckstop onboarding step
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS ts_onboarding_complete BOOLEAN NOT NULL DEFAULT false;

-- RPC: encrypt and store an org's Truckstop integration ID in Supabase Vault
CREATE OR REPLACE FUNCTION store_ts_integration_id(p_org_id UUID, p_integration_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret_id        UUID;
  v_existing_vault_id UUID;
BEGIN
  SELECT integration_id_vault_id INTO v_existing_vault_id
  FROM public.org_integrations
  WHERE org_id = p_org_id AND provider = 'truckstop';

  IF v_existing_vault_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_vault_id, p_integration_id);
  ELSE
    v_secret_id := vault.create_secret(
      p_integration_id,
      'ts_integration_id_' || p_org_id::text,
      'Truckstop integration ID for org ' || p_org_id::text
    );

    INSERT INTO public.org_integrations (org_id, provider, integration_id_vault_id)
    VALUES (p_org_id, 'truckstop', v_secret_id)
    ON CONFLICT (org_id, provider)
    DO UPDATE SET integration_id_vault_id = EXCLUDED.integration_id_vault_id;
  END IF;
END;
$$;

-- RPC: retrieve decrypted Truckstop integration ID for an org
CREATE OR REPLACE FUNCTION get_ts_integration_id(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_vault_id   UUID;
  v_decrypted  TEXT;
BEGIN
  SELECT integration_id_vault_id INTO v_vault_id
  FROM public.org_integrations
  WHERE org_id = p_org_id AND provider = 'truckstop';

  IF v_vault_id IS NULL THEN RETURN NULL; END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_vault_id;

  RETURN v_decrypted;
END;
$$;

-- Service role only — never expose to anon or authenticated roles
REVOKE ALL ON FUNCTION store_ts_integration_id(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_ts_integration_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION store_ts_integration_id(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_ts_integration_id(UUID) TO service_role;

-- Fix: store_ts_integration_id failed with a duplicate-key error ("secrets_name_idx")
-- when an org re-entered its Truckstop integration ID. The old version only updated
-- the secret when org_integrations.integration_id_vault_id was still set — but the
-- disconnect path nulls that reference while leaving the Vault secret in place, so the
-- next save tried to vault.create_secret() a name that already exists.
--
-- Now we look the secret up by NAME (its real unique key), update it if present, create
-- it only if not, and always (re)link org_integrations. Idempotent + handles re-saves
-- and reconnect-after-disconnect.
CREATE OR REPLACE FUNCTION store_ts_integration_id(p_org_id UUID, p_integration_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret_name TEXT := 'ts_integration_id_' || p_org_id::text;
  v_secret_id   UUID;
BEGIN
  -- Find any existing vault secret for this org by name, regardless of whether
  -- org_integrations still references it.
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, p_integration_id);
  ELSE
    v_secret_id := vault.create_secret(
      p_integration_id,
      v_secret_name,
      'Truckstop integration ID for org ' || p_org_id::text
    );
  END IF;

  INSERT INTO public.org_integrations (org_id, provider, integration_id_vault_id)
  VALUES (p_org_id, 'truckstop', v_secret_id)
  ON CONFLICT (org_id, provider)
  DO UPDATE SET integration_id_vault_id = EXCLUDED.integration_id_vault_id;
END;
$$;

REVOKE ALL ON FUNCTION store_ts_integration_id(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION store_ts_integration_id(UUID, TEXT) TO service_role;

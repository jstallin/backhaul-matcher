-- Security fix: lock down SECURITY DEFINER RPCs that were callable by anon/authenticated.
--
-- Postgres grants EXECUTE to PUBLIC on every function by default. These SECURITY DEFINER
-- helpers were created without revoking that default, so the `anon` role (anyone holding the
-- public anon key) could call them directly via PostgREST (/rest/v1/rpc/<fn>), bypassing RLS:
--
--   * add_credits            — mint unlimited credits for any user (Stripe bypass)        [CRITICAL]
--   * deduct_credit          — drain any user's credits
--   * get_ts_integration_id  — return the DECRYPTED Truckstop integration id from Vault   [CRITICAL]
--   * store_ts_integration_id— overwrite an org's Truckstop integration id
--   * set_user_as_driver     — manipulate driver role/identity
--   * link_driver_to_user    — link a driver record to an arbitrary user
--
-- All are invoked ONLY server-side with the service role (api/stripe/index.js,
-- api/integrations/[provider].js), so revoking anon/authenticated/PUBLIC breaks nothing —
-- service_role retains EXECUTE. We revoke from PUBLIC too because some still carry the
-- default PUBLIC grant that a plain anon/authenticated revoke would not remove.
--
-- Guarded with to_regprocedure() so it is portable across projects whose schemas have
-- drifted (e.g. staging lacks the driver functions) and idempotent on re-run.

DO $$
DECLARE
  fn   text;
  fns  text[] := ARRAY[
    'public.add_credits(uuid, integer, text, text)',
    'public.deduct_credit(uuid, integer, text)',
    'public.get_ts_integration_id(uuid)',
    'public.store_ts_integration_id(uuid, text)',
    'public.set_user_as_driver(text, text)',
    'public.link_driver_to_user(text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      RAISE NOTICE 'Revoked anon/authenticated/PUBLIC EXECUTE on %', fn;
    ELSE
      RAISE NOTICE 'Skipped (not present): %', fn;
    END IF;
  END LOOP;
END $$;

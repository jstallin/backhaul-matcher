-- Security hardening (#89): pin a non-mutable search_path on functions the Supabase
-- advisor flagged as `function_search_path_mutable` (lint 0011).
--
-- A mutable search_path lets the *caller's* search_path influence how unqualified
-- object names resolve inside the function — a hardening concern for SECURITY DEFINER
-- functions especially. Pinning to `public` makes resolution deterministic and clears
-- the advisor warning. These functions reference only `public` objects (or none, for
-- the trigger helpers), so `public` is non-breaking.
--
-- NOTE: the stricter ideal is `SET search_path = ''` with every object fully schema-
-- qualified in the body; that's deferred to avoid rewriting the credit-function bodies
-- here. `get_/store_ts_integration_id` already set their own search_path (incl. vault)
-- and are intentionally NOT touched.
--
-- Guarded DO block so it's portable across drifted schemas (staging lacks the driver
-- functions) and idempotent.

DO $$
DECLARE
  fn   text;
  fns  text[] := ARRAY[
    'public.add_credits(uuid, integer, text, text)',
    'public.deduct_credit(uuid, integer, text)',
    'public.handle_new_user()',
    'public.link_driver_to_user(text)',
    'public.set_user_as_driver(text, text)',
    'public.update_updated_at_column()',
    'public.update_user_integrations_updated_at()',
    'public.update_org_integrations_updated_at()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
      RAISE NOTICE 'Pinned search_path=public on %', fn;
    ELSE
      RAISE NOTICE 'Skipped (absent): %', fn;
    END IF;
  END LOOP;
END $$;

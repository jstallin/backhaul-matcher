-- Security hardening (#89, remaining items).

-- 1) route_distance_cache write policies (advisor lint 0024 rls_policy_always_true).
--    The INSERT/UPDATE policies for `authenticated` used always-true expressions, so any
--    signed-in user could write/overwrite any value in this shared driving-distance cache.
--
--    Driving distances are immutable (a route's distance doesn't change), so the cache only
--    needs INSERT (new entries) + SELECT (read). We therefore:
--      - bound the INSERT policy's WITH CHECK (reject absurd/garbage values), and
--      - DROP the UPDATE policy entirely (the client now upserts with ignoreDuplicates =
--        ON CONFLICT DO NOTHING, so no UPDATE is performed).
--    This clears the lint and makes existing entries non-overwritable (first-writer-wins) —
--    a signed-in user can at most populate a not-yet-cached route, never poison a cached one.
--    Scope unchanged: still `TO authenticated`, permissive. SELECT stays USING(true) (the
--    lint intentionally allows shared read access).
--
--    NOTE: this depends on the client change shipping with it (upsert ignoreDuplicates:true).
--    Apply this migration once that deploy is live so cache writes never hit a dropped
--    UPDATE policy with the old DO-UPDATE upsert.

DROP POLICY IF EXISTS "auth write distance cache" ON public.route_distance_cache;
CREATE POLICY "auth write distance cache" ON public.route_distance_cache
  FOR INSERT TO authenticated
  WITH CHECK (route_key IS NOT NULL AND distance_miles >= 0 AND distance_miles <= 25000);

DROP POLICY IF EXISTS "auth update distance cache" ON public.route_distance_cache;

-- 2) handle_new_user (advisor lint 0028/0029 anon/authenticated SECURITY DEFINER executable).
--    It's a SECURITY DEFINER function used only by an auth trigger (verified: 1 trigger, no
--    code callers). It should not be directly callable via /rest/v1/rpc. Revoke EXECUTE —
--    the trigger fires as the definer regardless of these grants, so this is non-breaking.
--    This clears the last remaining anon-executable SECURITY DEFINER function after #86.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

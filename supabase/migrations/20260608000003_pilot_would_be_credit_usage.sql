-- #131 fix: pilot orgs bypass credit deduction (they're free), so their billable
-- interactions never wrote a credit_transactions row — making the admin revenue
-- projection read 0 for exactly the cohort it exists to measure. Going forward the
-- /api/stripe deduct endpoint records a type='pilot' "would-be" charge (balance
-- untouched). This migration (a) teaches the aggregate to count those alongside real
-- 'usage', and (b) backfills past pilot searches/estimates from the search_run
-- activity events (1 credit each; WWP=5cr and auto-refresh history were never
-- recorded anywhere and can't be recovered).

-- (a) Count waived 'pilot' spend alongside real 'usage'.
CREATE OR REPLACE FUNCTION get_credit_usage_by_user(p_cutoff TIMESTAMPTZ)
RETURNS TABLE (
  user_id     UUID,
  credits_all BIGINT,
  count_all   BIGINT,
  credits_30d BIGINT,
  count_30d   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    user_id,
    COALESCE(SUM(-amount), 0)::BIGINT                                              AS credits_all,
    COUNT(*)::BIGINT                                                               AS count_all,
    COALESCE(SUM(CASE WHEN created_at >= p_cutoff THEN -amount ELSE 0 END), 0)::BIGINT AS credits_30d,
    COUNT(*) FILTER (WHERE created_at >= p_cutoff)::BIGINT                         AS count_30d
  FROM public.credit_transactions
  WHERE type IN ('usage', 'pilot')   -- #131: include would-be pilot charges
  GROUP BY user_id;
$$;

REVOKE EXECUTE ON FUNCTION get_credit_usage_by_user(TIMESTAMPTZ) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION get_credit_usage_by_user(TIMESTAMPTZ) TO service_role;

-- (b) One-time backfill of historical pilot search/estimate usage (1 credit each)
-- from activity events. Scoped to users with NO existing credit ledger rows — i.e.
-- fully-pilot users — which both avoids double-counting anyone who was ever charged
-- and makes a re-run a no-op (they'll then have 'pilot' rows).
INSERT INTO public.credit_transactions (user_id, amount, type, description, created_at)
SELECT
  e.user_id,
  -1,
  'pilot',
  'Backfilled ' || COALESCE(e.metadata->>'kind', 'backhaul') || ' search (pilot)',
  e.created_at
FROM public.user_activity_events e
WHERE e.event_type = 'search_run'
  AND e.user_id NOT IN (
    SELECT user_id FROM public.credit_transactions WHERE type IN ('usage', 'pilot')
  );

-- #131: per-user credit-usage aggregates for the admin Org Activity tile.
-- Sums billable spend (credit_transactions.type = 'usage'; amounts are stored
-- negative, so -amount = credits spent) all-time and over a trailing window, so
-- admins can project post-pilot revenue. Aggregated in SQL rather than pulling
-- every auto-refresh usage row into the serverless function.
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
  WHERE type = 'usage'
  GROUP BY user_id;
$$;

-- Admin-only: called by the service role in /api/orgs/activity. Lock out
-- anon/authenticated (#86 hygiene) — this aggregates other users' spend.
REVOKE EXECUTE ON FUNCTION get_credit_usage_by_user(TIMESTAMPTZ) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION get_credit_usage_by_user(TIMESTAMPTZ) TO service_role;

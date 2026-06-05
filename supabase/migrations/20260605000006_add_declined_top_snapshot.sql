-- Issue #84: snapshot the top match's derived dollar figures at the moment a
-- request is cancelled as OPERATIONS DECLINED. Live loads are never persisted
-- (zero-copy) — by report time the load is gone, so we store OUR computed
-- metrics only, same pattern as completed-haul net_revenue.
-- All nullable: populated only on an operations_declined cancel when a top
-- match is displayed; nets stay null without a fleet rate config.
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS declined_top_gross_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS declined_top_customer_net  NUMERIC,
  ADD COLUMN IF NOT EXISTS declined_top_carrier_net   NUMERIC,
  ADD COLUMN IF NOT EXISTS declined_top_load_summary  TEXT;  -- "Origin, ST → Dest, ST" context for the tile

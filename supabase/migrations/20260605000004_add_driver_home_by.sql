-- Issue #81: "Driver Needed Home By" date — dispatcher-visibility only.
-- Display-only signal on results/detail views; never sent to Truckstop/DF
-- search params and has no effect on matching. Nullable (optional field).
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS driver_home_by DATE;

-- The v1/v2 estimate forms share the same field (issue lists StartEstimateRequest.jsx),
-- and estimate requests persist to their own table.
ALTER TABLE estimate_requests
  ADD COLUMN IF NOT EXISTS driver_home_by DATE;

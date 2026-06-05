-- Issue #81: "Driver Needed Home By" date — dispatcher-visibility only.
-- Display-only signal on results/detail views; never sent to Truckstop/DF
-- search params and has no effect on matching. Nullable (optional field).
-- Backhaul requests only — estimate requests are an overall sales-figures
-- tool and intentionally don't carry this field.
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS driver_home_by DATE;

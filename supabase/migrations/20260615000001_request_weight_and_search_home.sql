-- Ryder feedback (#158, #159): per-request search controls on backhaul_requests.
--
-- #158 Max weight: max_weight_lbs is the optional upper bound for load weight.
--   NULL = no limit ("Limit Weight?" checkbox unchecked). Filtering is applied
--   post-fetch in our Truckstop proxy (the SOAP LoadSearch API has no weight
--   criterion), dropping loads whose reported weight exceeds the cap. Loads with
--   no reported weight pass through (matches the existing fleet-profile weight
--   behavior in routeHomeMatching.js).
--
-- #159 Bypass fleet home: when bypass_fleet_home is true, routing/matching uses
--   the search_home_* coordinates in place of the fleet's home. The fleet
--   association (rates, equipment) is unchanged — this is a per-request routing
--   override only. search_home_* are geocoded/verified the same way as the datum
--   point before save, so lat/lng are populated when bypass is on.
ALTER TABLE public.backhaul_requests
  ADD COLUMN IF NOT EXISTS max_weight_lbs     INTEGER,
  ADD COLUMN IF NOT EXISTS bypass_fleet_home  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS search_home_address TEXT,
  ADD COLUMN IF NOT EXISTS search_home_lat    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS search_home_lng    DOUBLE PRECISION;

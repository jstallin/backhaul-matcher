-- Item #48 Part 1: net-revenue-based change detection for notifications.
-- Store the previous top load's NET revenue and the average net of the top 25 so the
-- unified detector can compare against the last run. (last_top_match_id already exists;
-- last_top_match_revenue stays for back-compat but logic now keys on net.)
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS last_top_net NUMERIC,
  ADD COLUMN IF NOT EXISTS last_top25_avg_net NUMERIC;

-- Item #36: optional transport modes at the backhaul-request level (mirror of
-- fleet_profiles.modes). Multi-select; combined with the fleet's modes (union) at
-- search time. NULL/empty = no request-level preference.
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS modes TEXT[];

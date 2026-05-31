-- Item 007: optional transport modes a fleet handles (Truckstop modes), captured
-- at the fleet-profile level. Multi-select; NULL/empty = no preference. Threads into
-- the Truckstop SOAP envelope in a later step (currently equipment-only).
ALTER TABLE fleet_profiles
  ADD COLUMN IF NOT EXISTS modes TEXT[];

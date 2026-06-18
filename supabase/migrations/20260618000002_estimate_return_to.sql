-- #167: "Return To City, ST" on estimate requests. Ryder runs sales estimates before a fleet
-- exists, so the fleet is now optional (fleet_id was already nullable). When no fleet is
-- attached, Return To is the home/destination used for matching. When a fleet IS attached,
-- the form mirrors the fleet's home into Return To and the fleet home is authoritative.
ALTER TABLE public.estimate_requests
  ADD COLUMN IF NOT EXISTS return_to_point TEXT,
  ADD COLUMN IF NOT EXISTS return_to_city  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS return_to_state VARCHAR(20),
  ADD COLUMN IF NOT EXISTS return_to_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS return_to_lng   DOUBLE PRECISION;

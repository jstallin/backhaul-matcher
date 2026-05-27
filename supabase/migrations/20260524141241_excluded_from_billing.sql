ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS excluded_from_billing BOOLEAN NOT NULL DEFAULT false;

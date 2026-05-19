ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS hauled_load_id     TEXT,
  ADD COLUMN IF NOT EXISTS hauled_load_source TEXT;

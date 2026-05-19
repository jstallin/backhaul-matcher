ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS pilot_start_date DATE,
  ADD COLUMN IF NOT EXISTS pilot_end_date   DATE;

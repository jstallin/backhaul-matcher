ALTER TABLE work_week_plans
  ADD COLUMN IF NOT EXISTS outbound_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS return_status   TEXT NOT NULL DEFAULT 'pending';

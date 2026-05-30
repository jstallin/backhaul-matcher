-- Item 006-P1: cap the number of auto-refreshes before auto-disabling.
-- max_auto_refreshes: NULL = unlimited; auto_refresh_count: refreshes run so far.
ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS max_auto_refreshes INTEGER,
  ADD COLUMN IF NOT EXISTS auto_refresh_count INTEGER NOT NULL DEFAULT 0;

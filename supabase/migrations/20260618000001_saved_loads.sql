-- #163: "Save a load" — user-bookmarked snapshots of live (zero-copy) third-party loads.
--
-- A dedicated table (NOT imported_loads) so saved bookmarks never enter the matching /
-- import pipeline (getLoadsForMatching reads imported_loads). We persist OUR snapshot of
-- the load at save time — the live row may be gone later — mirroring the hauled/declined
-- snapshot pattern. request_id ties the save back to the originating backhaul request so
-- the Loads-view "Haul" action can reuse the existing request haul flow.
CREATE TABLE IF NOT EXISTS saved_loads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_id UUID REFERENCES backhaul_requests(id) ON DELETE SET NULL,
  fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,

  -- Load identity (live source). Unique per user so re-saving is idempotent.
  load_id VARCHAR(120) NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'truckstop' | 'directfreight' | 'imported' | 'demo'

  -- Origin (A of the load) / destination (B of the load)
  origin_city VARCHAR(100),
  origin_state VARCHAR(20),
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_city VARCHAR(100),
  destination_state VARCHAR(20),
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,

  -- Snapshot of our computed/displayed figures at save time
  pickup_date DATE,
  delivery_date DATE,
  distance_miles INTEGER,
  out_of_route_miles INTEGER,
  revenue_amount NUMERIC,   -- posted/gross revenue (match.totalRevenue)
  net_revenue NUMERIC,      -- our computed customer net (match.customer_net_credit ?? netRevenue)
  equipment_type VARCHAR(50),
  weight_lbs INTEGER,
  length_ft INTEGER,

  -- Broker / shipper
  company_name VARCHAR(255), -- broker
  shipper VARCHAR(255),
  freight_type VARCHAR(120),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),

  -- Full original match snapshot for the detail view + future-proofing
  raw_data JSONB,
  status VARCHAR(20) DEFAULT 'saved',
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE saved_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved loads" ON saved_loads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own saved loads" ON saved_loads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own saved loads" ON saved_loads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own saved loads" ON saved_loads
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_saved_loads_user_id ON saved_loads(user_id);
CREATE INDEX idx_saved_loads_status ON saved_loads(status);
CREATE INDEX idx_saved_loads_created_at ON saved_loads(created_at DESC);

-- Re-saving the same load is idempotent (one row per user+load+source).
CREATE UNIQUE INDEX idx_saved_loads_unique ON saved_loads(user_id, load_id, source);

CREATE TRIGGER update_saved_loads_updated_at BEFORE UPDATE ON saved_loads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE saved_loads IS '#163: user-bookmarked snapshots of live third-party loads (zero-copy; not a matching source)';

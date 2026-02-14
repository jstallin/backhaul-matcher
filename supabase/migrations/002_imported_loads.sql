-- Imported Loads Table
-- Stores loads imported from load boards via Chrome extension

CREATE TABLE imported_loads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,

  -- Load identification
  external_id VARCHAR(100), -- ID from load board (e.g., DAT load ID)
  source VARCHAR(50) NOT NULL, -- 'dat', '123loadboard', 'manual', etc.

  -- Origin details
  origin_city VARCHAR(100) NOT NULL,
  origin_state VARCHAR(10),
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),

  -- Destination details
  destination_city VARCHAR(100) NOT NULL,
  destination_state VARCHAR(10),
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),

  -- Load details
  pickup_date DATE,
  delivery_date DATE,
  distance_miles INTEGER,
  rate DECIMAL(10, 2),
  rate_per_mile DECIMAL(6, 2),

  -- Equipment
  equipment_type VARCHAR(50), -- 'V' (Van), 'R' (Reefer), 'F' (Flatbed), etc.
  full_partial VARCHAR(10), -- 'F' (Full), 'P' (Partial)
  weight_lbs INTEGER,
  length_ft INTEGER,

  -- Broker/Company info
  company_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  credit_score INTEGER, -- DAT credit score
  days_to_pay INTEGER,

  -- Metadata
  raw_data JSONB, -- Store complete original data from extension
  status VARCHAR(20) DEFAULT 'available', -- 'available', 'contacted', 'booked', 'expired', 'dismissed'
  notes TEXT,

  -- Timestamps
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posted_age VARCHAR(20), -- Original age from load board (e.g., "00:08")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE imported_loads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own imported loads" ON imported_loads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own imported loads" ON imported_loads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own imported loads" ON imported_loads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imported loads" ON imported_loads
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_imported_loads_user_id ON imported_loads(user_id);
CREATE INDEX idx_imported_loads_fleet_id ON imported_loads(fleet_id);
CREATE INDEX idx_imported_loads_status ON imported_loads(status);
CREATE INDEX idx_imported_loads_source ON imported_loads(source);
CREATE INDEX idx_imported_loads_imported_at ON imported_loads(imported_at DESC);
CREATE INDEX idx_imported_loads_external_id ON imported_loads(external_id);
CREATE INDEX idx_imported_loads_pickup_date ON imported_loads(pickup_date);

-- Unique constraint to prevent duplicate imports
CREATE UNIQUE INDEX idx_imported_loads_unique ON imported_loads(user_id, external_id, source)
  WHERE external_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_imported_loads_updated_at BEFORE UPDATE ON imported_loads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE imported_loads IS 'Loads imported from external load boards via Chrome extension';
COMMENT ON COLUMN imported_loads.external_id IS 'Original ID from load board (DAT load ID, etc.)';
COMMENT ON COLUMN imported_loads.source IS 'Load board source: dat, 123loadboard, manual, etc.';
COMMENT ON COLUMN imported_loads.raw_data IS 'Complete JSON data as received from extension';

-- BackHaul Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Fleets table
CREATE TABLE fleets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  mc_number VARCHAR(50),
  dot_number VARCHAR(50),
  home_address TEXT NOT NULL,
  home_lat DECIMAL(10, 8),
  home_lng DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trucks table
CREATE TABLE trucks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  truck_number VARCHAR(50) NOT NULL,
  trailer_type VARCHAR(50) NOT NULL, -- 'Dry Van', 'Reefer', 'Flatbed', etc.
  trailer_length INTEGER NOT NULL, -- in feet
  weight_limit INTEGER NOT NULL, -- in pounds
  door_type VARCHAR(20), -- 'Swing', 'Roll'
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'maintenance', 'inactive'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(fleet_id, truck_number)
);

-- Drivers table
CREATE TABLE drivers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  cdl_number VARCHAR(50),
  cdl_state VARCHAR(2),
  assigned_truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'on_leave'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fleet profiles (extended settings)
CREATE TABLE fleet_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL UNIQUE,
  default_search_radius INTEGER DEFAULT 50, -- in miles
  default_relay_mode BOOLEAN DEFAULT false,
  toll_discouraged BOOLEAN DEFAULT true,
  notification_email VARCHAR(255),
  notification_phone VARCHAR(20),
  preferences JSONB DEFAULT '{}', -- Store additional flexible preferences
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Search history (for analytics and learning)
CREATE TABLE search_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  final_stop_address TEXT NOT NULL,
  final_stop_lat DECIMAL(10, 8),
  final_stop_lng DECIMAL(11, 8),
  search_radius INTEGER NOT NULL,
  relay_mode BOOLEAN NOT NULL,
  results_count INTEGER,
  top_score DECIMAL(12, 2),
  search_params JSONB, -- Store complete search parameters
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved opportunities (bookmarked loads)
CREATE TABLE saved_opportunities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id VARCHAR(100) NOT NULL, -- External load board ID
  load_data JSONB NOT NULL, -- Store complete load details
  notes TEXT,
  status VARCHAR(20) DEFAULT 'saved', -- 'saved', 'contacted', 'booked', 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles (extends auth.users)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role VARCHAR(20) DEFAULT 'fleet_manager', -- 'fleet_manager', 'driver', 'dispatcher'
  full_name VARCHAR(255),
  phone VARCHAR(20),
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Fleets policies
CREATE POLICY "Users can view their own fleets" ON fleets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own fleets" ON fleets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fleets" ON fleets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fleets" ON fleets
  FOR DELETE USING (auth.uid() = user_id);

-- Trucks policies
CREATE POLICY "Users can view trucks in their fleets" ON trucks
  FOR SELECT USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create trucks in their fleets" ON trucks
  FOR INSERT WITH CHECK (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update trucks in their fleets" ON trucks
  FOR UPDATE USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete trucks in their fleets" ON trucks
  FOR DELETE USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

-- Drivers policies (similar to trucks)
CREATE POLICY "Users can view drivers in their fleets" ON drivers
  FOR SELECT USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can create drivers in their fleets" ON drivers
  FOR INSERT WITH CHECK (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update drivers in their fleets" ON drivers
  FOR UPDATE USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can delete drivers in their fleets" ON drivers
  FOR DELETE USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

-- Fleet profiles policies
CREATE POLICY "Users can view their fleet profiles" ON fleet_profiles
  FOR SELECT USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage their fleet profiles" ON fleet_profiles
  FOR ALL USING (
    fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid())
  );

-- Search history policies
CREATE POLICY "Users can view their search history" ON search_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create search history" ON search_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Saved opportunities policies
CREATE POLICY "Users can manage their saved opportunities" ON saved_opportunities
  FOR ALL USING (user_id = auth.uid());

-- User profiles policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to all tables with updated_at
CREATE TRIGGER update_fleets_updated_at BEFORE UPDATE ON fleets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON trucks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fleet_profiles_updated_at BEFORE UPDATE ON fleet_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_opportunities_updated_at BEFORE UPDATE ON saved_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'fleet_manager')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_fleets_user_id ON fleets(user_id);
CREATE INDEX idx_trucks_fleet_id ON trucks(fleet_id);
CREATE INDEX idx_drivers_fleet_id ON drivers(fleet_id);
CREATE INDEX idx_drivers_user_id ON drivers(user_id);
CREATE INDEX idx_search_history_fleet_id ON search_history(fleet_id);
CREATE INDEX idx_search_history_created_at ON search_history(created_at DESC);
CREATE INDEX idx_saved_opportunities_fleet_id ON saved_opportunities(fleet_id);
CREATE INDEX idx_saved_opportunities_status ON saved_opportunities(status);

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

-- You can add sample data here after creating a user through the Supabase Auth UI
-- Replace 'YOUR_USER_ID' with actual user ID from auth.users

/*
INSERT INTO fleets (user_id, name, mc_number, home_address, home_lat, home_lng)
VALUES (
  'YOUR_USER_ID',
  'Carolina Transport Fleet',
  'MC-123456',
  'Davidson, NC',
  35.4993,
  -80.8481
);

INSERT INTO trucks (fleet_id, truck_number, trailer_type, trailer_length, weight_limit)
SELECT 
  id,
  'TRUCK-001',
  'Dry Van',
  53,
  45000
FROM fleets
WHERE user_id = 'YOUR_USER_ID'
LIMIT 1;
*/

-- Initial schema: core tables created before migration tracking began.
-- Subsequent migrations use ADD COLUMN IF NOT EXISTS, so including all
-- current columns here makes those migrations safe no-ops on staging.

-- ─── Trigger functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'fleet_manager')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── user_profiles ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        VARCHAR DEFAULT 'fleet_manager',
  full_name   VARCHAR,
  phone       VARCHAR,
  avatar_url  TEXT,
  preferences JSONB DEFAULT '{}',
  is_admin    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"   ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- ─── fleets ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fleets (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         VARCHAR NOT NULL,
  mc_number    VARCHAR,
  dot_number   VARCHAR,
  home_address TEXT NOT NULL,
  home_lat     NUMERIC,
  home_lng     NUMERIC,
  phone_number VARCHAR,
  email        VARCHAR,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own fleets"   ON fleets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own fleets" ON fleets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own fleets" ON fleets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own fleets" ON fleets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fleets_user_id ON fleets(user_id);

CREATE OR REPLACE TRIGGER update_fleets_updated_at
  BEFORE UPDATE ON fleets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── trucks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trucks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id       UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  truck_number   VARCHAR NOT NULL,
  trailer_type   VARCHAR NOT NULL,
  trailer_length INTEGER NOT NULL,
  weight_limit   INTEGER NOT NULL,
  door_type      VARCHAR,
  status         VARCHAR DEFAULT 'active',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fleet_id, truck_number)
);

ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view trucks in their fleets"   ON trucks FOR SELECT USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));
CREATE POLICY "Users can create trucks in their fleets" ON trucks FOR INSERT WITH CHECK (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));
CREATE POLICY "Users can update trucks in their fleets" ON trucks FOR UPDATE USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete trucks in their fleets" ON trucks FOR DELETE USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_trucks_fleet_id ON trucks(fleet_id);

CREATE OR REPLACE TRIGGER update_trucks_updated_at
  BEFORE UPDATE ON trucks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── drivers ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id          UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name        VARCHAR NOT NULL,
  last_name         VARCHAR NOT NULL,
  email             VARCHAR,
  phone             VARCHAR,
  cdl_number        VARCHAR,
  cdl_state         VARCHAR,
  assigned_truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  status            VARCHAR DEFAULT 'active',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drivers in their fleets"   ON drivers FOR SELECT USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Users can create drivers in their fleets" ON drivers FOR INSERT WITH CHECK (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));
CREATE POLICY "Users can update drivers in their fleets" ON drivers FOR UPDATE USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Users can delete drivers in their fleets" ON drivers FOR DELETE USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_drivers_fleet_id ON drivers(fleet_id);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id  ON drivers(user_id);

CREATE OR REPLACE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── fleet_profiles ───────────────────────────────────────────────────────────
-- Includes all columns (AI preference, charge descriptions, equipment) so that
-- the later ADD COLUMN IF NOT EXISTS migrations are safe no-ops on fresh DBs.

CREATE TABLE IF NOT EXISTS fleet_profiles (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id                 UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL UNIQUE,
  default_search_radius    INTEGER DEFAULT 50,
  default_relay_mode       BOOLEAN DEFAULT FALSE,
  toll_discouraged         BOOLEAN DEFAULT TRUE,
  notification_email       VARCHAR,
  notification_phone       VARCHAR,
  preferences              JSONB DEFAULT '{}',
  revenue_split_carrier    INTEGER DEFAULT 80,
  revenue_split_customer   INTEGER DEFAULT 20,
  mileage_rate             NUMERIC,
  stop_rate                NUMERIC,
  other_charge_1_name      VARCHAR,
  other_charge_1_amount    NUMERIC,
  other_charge_1_description VARCHAR,
  other_charge_2_name      VARCHAR,
  other_charge_2_amount    NUMERIC,
  other_charge_2_description VARCHAR,
  fuel_peg                 NUMERIC,
  fuel_mpg                 NUMERIC DEFAULT 6.0,
  doe_padd_region          VARCHAR,
  doe_padd_rate            NUMERIC,
  doe_padd_updated_at      TIMESTAMPTZ,
  trailer_type             VARCHAR,
  equipment_variation      VARCHAR,
  ai_preference_profile    TEXT,
  ai_profile_updated_at    TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fleet_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their fleet profiles"   ON fleet_profiles FOR SELECT USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage their fleet profiles" ON fleet_profiles FOR ALL   USING (fleet_id IN (SELECT id FROM fleets WHERE user_id = auth.uid()));

CREATE OR REPLACE TRIGGER update_fleet_profiles_updated_at
  BEFORE UPDATE ON fleet_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── search_history ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_history (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id           UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  truck_id           UUID REFERENCES trucks(id) ON DELETE SET NULL,
  final_stop_address TEXT NOT NULL,
  final_stop_lat     NUMERIC,
  final_stop_lng     NUMERIC,
  search_radius      INTEGER NOT NULL,
  relay_mode         BOOLEAN NOT NULL,
  results_count      INTEGER,
  top_score          NUMERIC,
  search_params      JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their search history" ON search_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create search history"     ON search_history FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_search_history_fleet_id   ON search_history(fleet_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);

-- ─── saved_opportunities ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_opportunities (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id   UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id    VARCHAR NOT NULL,
  load_data  JSONB NOT NULL,
  notes      TEXT,
  status     VARCHAR DEFAULT 'saved',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their saved opportunities" ON saved_opportunities FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_opportunities_fleet_id ON saved_opportunities(fleet_id);
CREATE INDEX IF NOT EXISTS idx_saved_opportunities_status   ON saved_opportunities(status);

CREATE OR REPLACE TRIGGER update_saved_opportunities_updated_at
  BEFORE UPDATE ON saved_opportunities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── backhaul_requests ────────────────────────────────────────────────────────
-- Includes all columns added by later migrations (server refresh, datum city/state)
-- so those ADD COLUMN IF NOT EXISTS migrations are no-ops on fresh DBs.

CREATE TABLE IF NOT EXISTS backhaul_requests (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fleet_id                UUID REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  request_name            VARCHAR NOT NULL,
  datum_point             VARCHAR NOT NULL,
  equipment_available_date DATE NOT NULL,
  equipment_needed_date   DATE NOT NULL,
  is_relay                BOOLEAN DEFAULT FALSE,
  auto_refresh            BOOLEAN DEFAULT FALSE,
  auto_refresh_interval   INTEGER,
  last_refresh_at         TIMESTAMPTZ,
  next_refresh_at         TIMESTAMPTZ,
  notification_enabled    BOOLEAN DEFAULT FALSE,
  notification_method     VARCHAR,
  status                  VARCHAR DEFAULT 'active',
  last_top_result_id      VARCHAR,
  last_top_result_data    JSONB,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  expired_at              TIMESTAMPTZ,
  cancellation_reason     VARCHAR,
  revenue_amount          NUMERIC,
  out_of_route_miles      NUMERIC,
  last_top_match_id       TEXT,
  last_top_match_revenue  NUMERIC,
  last_server_refresh_at  TIMESTAMPTZ,
  net_revenue             NUMERIC,
  load_distance_miles     NUMERIC,
  datum_city              VARCHAR(100),
  datum_state             VARCHAR(20),
  datum_lat               DOUBLE PRECISION,
  datum_lng               DOUBLE PRECISION,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backhaul_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests"   ON backhaul_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own requests" ON backhaul_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own requests" ON backhaul_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own requests" ON backhaul_requests FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_backhaul_requests_auto_refresh ON backhaul_requests(status, auto_refresh, next_refresh_at)
  WHERE (status = 'active' AND auto_refresh = TRUE);
CREATE INDEX IF NOT EXISTS idx_requests_next_refresh ON backhaul_requests(next_refresh_at)
  WHERE (auto_refresh = TRUE AND status = 'active');

CREATE OR REPLACE TRIGGER update_backhaul_requests_updated_at
  BEFORE UPDATE ON backhaul_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── estimate_requests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estimate_requests (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fleet_id                 UUID REFERENCES fleets(id) ON DELETE CASCADE,
  request_name             TEXT NOT NULL,
  datum_point              TEXT NOT NULL,
  equipment_available_date DATE,
  equipment_needed_date    DATE,
  is_relay                 BOOLEAN DEFAULT FALSE,
  status                   TEXT DEFAULT 'active',
  annual_volume            INTEGER,
  min_net_credit           NUMERIC,
  cancellation_reason      TEXT,
  cancelled_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE estimate_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own estimate requests" ON estimate_requests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER update_estimate_requests_updated_at
  BEFORE UPDATE ON estimate_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── route_distance_cache ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS route_distance_cache (
  route_key      TEXT PRIMARY KEY,
  distance_miles NUMERIC NOT NULL,
  cached_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE route_distance_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read distance cache"   ON route_distance_cache FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth write distance cache"  ON route_distance_cache FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth update distance cache" ON route_distance_cache FOR UPDATE TO authenticated USING (TRUE);

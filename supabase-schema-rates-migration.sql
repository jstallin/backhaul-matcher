-- Rate Configuration Migration for fleet_profiles table
-- Run this in your Supabase SQL Editor
-- Adds carrier rate structure fields needed for net revenue calculations

-- Revenue split (carrier/customer percentage of gross backhaul revenue)
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS revenue_split_carrier INTEGER DEFAULT 20;
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS revenue_split_customer INTEGER DEFAULT 80;

-- Mileage and stop rates (carrier charges to customer)
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS mileage_rate DECIMAL(8,2);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS stop_rate DECIMAL(8,2);

-- Other charges (flexible custom charges)
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS other_charge_1_name VARCHAR(100);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS other_charge_1_amount DECIMAL(8,2);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS other_charge_2_name VARCHAR(100);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS other_charge_2_amount DECIMAL(8,2);

-- Fuel surcharge components
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS fuel_peg DECIMAL(6,3);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS fuel_mpg DECIMAL(4,1) DEFAULT 6.0;
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS doe_padd_region VARCHAR(30);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS doe_padd_rate DECIMAL(6,3);
ALTER TABLE fleet_profiles ADD COLUMN IF NOT EXISTS doe_padd_updated_at TIMESTAMP WITH TIME ZONE;

-- Fuel Surcharge Formula:
--   FSC per mile = (doe_padd_rate - fuel_peg) / fuel_mpg
--
-- Net Revenue Formula:
--   Customer Share = Gross Backhaul Revenue × (revenue_split_customer / 100)
--   Expenses = (OOR Miles × mileage_rate) + (Stop Count × stop_rate) + (OOR Miles × FSC per mile)
--   Customer Net Credit = Customer Share - Expenses
--   Carrier Revenue = Gross Backhaul Revenue × (revenue_split_carrier / 100)

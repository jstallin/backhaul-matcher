import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database helper functions
export const db = {
  // Fleet operations
  fleets: {
    async getAll(userId) {
      const { data, error } = await supabase
        .from('fleets')
        .select('*, fleet_profiles(*), trucks(*), drivers(*)')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    },
    
    async getById(fleetId) {
      const { data, error } = await supabase
        .from('fleets')
        .select('*, fleet_profiles(*), trucks(*), drivers(*)')
        .eq('id', fleetId)
        .single();
      if (error) throw error;
      return data;
    },
    
    async create(fleetData) {
      const { data, error } = await supabase
        .from('fleets')
        .insert([fleetData])
        .select()
        .single();
      if (error) throw error;
      
      // Create default fleet profile
      await supabase
        .from('fleet_profiles')
        .insert([{ fleet_id: data.id }]);
      
      return data;
    },
    
    async update(fleetId, updates) {
      const { data, error } = await supabase
        .from('fleets')
        .update(updates)
        .eq('id', fleetId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async delete(fleetId) {
      const { error } = await supabase
        .from('fleets')
        .delete()
        .eq('id', fleetId);
      if (error) throw error;
    }
  },
  
  // Truck operations
  trucks: {
    async getByFleet(fleetId) {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('fleet_id', fleetId)
        .order('truck_number');
      if (error) throw error;
      return data;
    },
    
    async create(truckData) {
      const { data, error } = await supabase
        .from('trucks')
        .insert([truckData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async update(truckId, updates) {
      const { data, error } = await supabase
        .from('trucks')
        .update(updates)
        .eq('id', truckId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async delete(truckId) {
      const { error } = await supabase
        .from('trucks')
        .delete()
        .eq('id', truckId);
      if (error) throw error;
    }
  },
  
  // Driver operations
  drivers: {
    async getByFleet(fleetId) {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, trucks(*)')
        .eq('fleet_id', fleetId)
        .order('last_name');
      if (error) throw error;
      return data;
    },
    
    async create(driverData) {
      const { data, error } = await supabase
        .from('drivers')
        .insert([driverData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async update(driverId, updates) {
      const { data, error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', driverId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async delete(driverId) {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq('id', driverId);
      if (error) throw error;
    }
  },
  
  // Fleet profile operations
  fleetProfiles: {
    async get(fleetId) {
      const { data, error } = await supabase
        .from('fleet_profiles')
        .select('*')
        .eq('fleet_id', fleetId)
        .single();
      if (error) throw error;
      return data;
    },
    
    async update(fleetId, updates) {
      const { data, error } = await supabase
        .from('fleet_profiles')
        .update(updates)
        .eq('fleet_id', fleetId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },
  
  // Search history operations
  searchHistory: {
    async create(searchData) {
      const { data, error } = await supabase
        .from('search_history')
        .insert([searchData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async getRecent(fleetId, limit = 10) {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    }
  },
  
  // Saved opportunities operations
  savedOpportunities: {
    async getAll(fleetId) {
      const { data, error } = await supabase
        .from('saved_opportunities')
        .select('*')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    
    async create(opportunityData) {
      const { data, error } = await supabase
        .from('saved_opportunities')
        .insert([opportunityData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async update(opportunityId, updates) {
      const { data, error } = await supabase
        .from('saved_opportunities')
        .update(updates)
        .eq('id', opportunityId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    
    async delete(opportunityId) {
      const { error } = await supabase
        .from('saved_opportunities')
        .delete()
        .eq('id', opportunityId);
      if (error) throw error;
    }
  },
  
  // User profile operations
  userProfiles: {
    async get(userId) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    
    async update(userId, updates) {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }
};

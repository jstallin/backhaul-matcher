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
  },

  // Request operations
  requests: {
    async getAll(userId) {
      const { data, error } = await supabase
        .from('backhaul_requests')
        .select('*, fleets(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    async getById(requestId) {
      const { data, error } = await supabase
        .from('backhaul_requests')
        .select('*, fleets(*)')
        .eq('id', requestId)
        .single();
      if (error) throw error;
      return data;
    },

    async create(requestData) {
      const { data, error } = await supabase
        .from('backhaul_requests')
        .insert([requestData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async update(requestId, updates) {
      const { data, error } = await supabase
        .from('backhaul_requests')
        .update(updates)
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async delete(requestId) {
      const { error } = await supabase
        .from('backhaul_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      return { success: true };
    },

    // Get active requests with auto-refresh enabled
    async getActiveAutoRefresh() {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('backhaul_requests')
        .select('*, fleets(*)')
        .eq('status', 'active')
        .eq('auto_refresh', true)
        .lte('next_refresh_at', now)
        .order('next_refresh_at', { ascending: true });
      if (error) throw error;
      return data;
    }
  },

  // User integrations operations
  integrations: {
    async getByUser(userId) {
      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    },

    async getByProvider(userId, provider) {
      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single();
      // Don't throw on no rows found
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async isConnected(userId, provider) {
      const integration = await this.getByProvider(userId, provider);
      if (!integration) return false;

      // Check if token is expired
      if (integration.token_expires_at) {
        const isExpired = new Date(integration.token_expires_at) < new Date();
        return integration.is_connected && !isExpired;
      }

      return integration.is_connected;
    },

    async disconnect(userId, provider) {
      const { error } = await supabase
        .from('user_integrations')
        .update({
          is_connected: false,
          access_token: null,
          refresh_token: null,
          token_expires_at: null
        })
        .eq('user_id', userId)
        .eq('provider', provider);
      if (error) throw error;
    }
  },

  // Imported loads operations (from Chrome extension)
  importedLoads: {
    async getAll(userId, options = {}) {
      let query = supabase
        .from('imported_loads')
        .select('*')
        .eq('user_id', userId)
        .order('imported_at', { ascending: false });

      if (options.status) {
        query = query.eq('status', options.status);
      }
      if (options.source) {
        query = query.eq('source', options.source);
      }
      if (options.fleetId) {
        query = query.eq('fleet_id', options.fleetId);
      }
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async getAvailable(userId, fleetId = null) {
      let query = supabase
        .from('imported_loads')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'available')
        .order('imported_at', { ascending: false });

      if (fleetId) {
        query = query.eq('fleet_id', fleetId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async getById(loadId) {
      const { data, error } = await supabase
        .from('imported_loads')
        .select('*')
        .eq('id', loadId)
        .single();
      if (error) throw error;
      return data;
    },

    async create(loadData) {
      const { data, error } = await supabase
        .from('imported_loads')
        .insert([loadData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async createBatch(loadsArray) {
      const { data, error } = await supabase
        .from('imported_loads')
        .insert(loadsArray)
        .select();
      if (error) throw error;
      return data;
    },

    async update(loadId, updates) {
      const { data, error } = await supabase
        .from('imported_loads')
        .update(updates)
        .eq('id', loadId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateStatus(loadId, status, notes = null) {
      const updates = { status };
      if (notes) updates.notes = notes;

      const { data, error } = await supabase
        .from('imported_loads')
        .update(updates)
        .eq('id', loadId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async delete(loadId) {
      const { error } = await supabase
        .from('imported_loads')
        .delete()
        .eq('id', loadId);
      if (error) throw error;
    },

    async deleteByStatus(userId, status) {
      const { error } = await supabase
        .from('imported_loads')
        .delete()
        .eq('user_id', userId)
        .eq('status', status);
      if (error) throw error;
    },

    async checkDuplicate(userId, externalId, source) {
      if (!externalId) return null;

      const { data, error } = await supabase
        .from('imported_loads')
        .select('id')
        .eq('user_id', userId)
        .eq('external_id', externalId)
        .eq('source', source)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  }
};

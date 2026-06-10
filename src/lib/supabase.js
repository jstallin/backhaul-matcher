import { createClient } from '@supabase/supabase-js';
import { diffShareSet } from '../utils/fleetShares.js';

// Read env from whichever runtime we're in: the Vite client build exposes
// `import.meta.env`; the Node serverless/cron runtime (which now imports the
// shared db helpers + matcher) exposes `process.env`. In Node `import.meta.env`
// is undefined, so we must guard it — otherwise this module throws at import time
// the moment a server function pulls in the matching algorithm.
const env = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {});
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database helper functions
export const db = {
  // Fleet operations
  fleets: {
    async getAll(userId) {
      // #129: RLS returns own fleets + fleets shared with the caller (view-only), so
      // we no longer filter by user_id here — rows carry user_id for the UI to mark
      // ownership. `userId` is kept for signature/compat; RLS scopes to the caller.
      const { data, error } = await supabase
        .from('fleets')
        .select('*, fleet_profiles(*), trucks(*), drivers(*)');
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
    },

    // #38: duplicate a fleet — copies the fleets row + its fleet_profiles rate
    // config (carrier %, mileage/stop rates, fuel PEG/MPG, DOE PADD, equipment,
    // modes, other charges). Home address/coords are kept (user edits after).
    // Trucks/drivers are intentionally NOT copied (first-pass scope per issue).
    async duplicate(fleetId) {
      const source = await this.getById(fleetId);

      // Copy every fleet column except identity/meta; column-agnostic so new
      // fields are picked up automatically.
      const { id, created_at, updated_at, fleet_profiles, trucks, drivers, ...fleetFields } = source;
      const { data: newFleet, error } = await supabase
        .from('fleets')
        .insert([{ ...fleetFields, name: `Copy of ${source.name}` }])
        .select()
        .single();
      if (error) throw error;

      // fleet_profiles joins as an array here (fleet_id is not unique).
      const sourceProfile = Array.isArray(fleet_profiles) ? fleet_profiles[0] : fleet_profiles;
      const { id: _pid, fleet_id: _pfid, created_at: _pc, updated_at: _pu, ...profileFields } = sourceProfile || {};
      const { error: profileError } = await supabase
        .from('fleet_profiles')
        .insert([{ ...profileFields, fleet_id: newFleet.id }]);
      if (profileError) throw profileError;

      return newFleet;
    }
  },

  // #129: per-fleet view-only access grants to org members. Owner-managed
  // (enforced by RLS on fleet_shares); recipients get read-only SELECT on the
  // fleet + its profile/trucks/drivers.
  fleetShares: {
    // Current grantee user_ids for a fleet (owner view).
    async listForFleet(fleetId) {
      const { data, error } = await supabase
        .from('fleet_shares')
        .select('shared_with_user_id')
        .eq('fleet_id', fleetId);
      if (error) throw error;
      return (data || []).map(r => r.shared_with_user_id);
    },

    // Replace-set: grant the given user_ids, revoke any no longer selected.
    async setForFleet(fleetId, userIds, sharedByUserId) {
      const current = await this.listForFleet(fleetId);
      const { added, removed } = diffShareSet(current, userIds);
      if (added.length) {
        const rows = added.map(uid => ({
          fleet_id: fleetId, shared_with_user_id: uid, shared_by_user_id: sharedByUserId,
        }));
        const { error } = await supabase.from('fleet_shares').insert(rows);
        if (error) throw error;
      }
      if (removed.length) {
        const { error } = await supabase
          .from('fleet_shares')
          .delete()
          .eq('fleet_id', fleetId)
          .in('shared_with_user_id', removed);
        if (error) throw error;
      }
      return { added, removed };
    },
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
        .upsert({ fleet_id: fleetId, ...updates }, { onConflict: 'fleet_id' })
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
        .in('status', ['active', 'in_progress']) // item 008: in_progress keeps auto-refreshing
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

  // Org membership — client-side read (RLS: users see their own row)
  orgs: {
    async getMyMembership(userId) {
      const { data, error } = await supabase
        .from('org_memberships')
        .select('role, orgs(*)')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data; // { role, orgs: { id, name, email_domain, ... } } or null
    }
  },

  // Org-level integrations (shared API tokens for enterprise email domains)
  orgIntegrations: {
    async getByDomain(emailDomain, provider) {
      const { data, error } = await supabase
        .from('org_integrations')
        .select('*')
        .eq('email_domain', emailDomain)
        .eq('provider', provider)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async isConnected(emailDomain, provider) {
      const integration = await this.getByDomain(emailDomain, provider);
      return !!integration?.api_token;
    }
  },

  // Route distance cache — shared across all users, keyed by lane (origin→dest)
  distanceCache: {
    async getBatch(routeKeys) {
      if (!routeKeys.length) return [];
      const { data, error } = await supabase
        .from('route_distance_cache')
        .select('route_key, distance_miles')
        .in('route_key', routeKeys);
      if (error) throw error;
      return data || [];
    },

    async upsertBatch(entries) {
      if (!entries.length) return;
      // Deduplicate by route_key — Postgres rejects an upsert batch that tries to
      // update the same row twice (e.g. two loads sharing a common leg).
      const seen = new Map();
      for (const entry of entries) seen.set(entry.route_key, entry);
      // ignoreDuplicates: driving distances are immutable, so never overwrite an existing
      // cached entry (ON CONFLICT DO NOTHING). This also lets the table drop its UPDATE
      // RLS policy (#89) — existing entries are non-overwritable (first-writer-wins).
      const { error } = await supabase
        .from('route_distance_cache')
        .upsert([...seen.values()], { onConflict: 'route_key', ignoreDuplicates: true });
      if (error) throw error;
    }
  },

  // Estimate request operations
  estimateRequests: {
    async getAll(userId) {
      const { data, error } = await supabase
        .from('estimate_requests')
        .select('*, fleets(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    async getById(requestId) {
      const { data, error } = await supabase
        .from('estimate_requests')
        .select('*, fleets(*)')
        .eq('id', requestId)
        .single();
      if (error) throw error;
      return data;
    },

    async create(requestData) {
      const { data, error } = await supabase
        .from('estimate_requests')
        .insert([requestData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async update(requestId, updates) {
      const { data, error } = await supabase
        .from('estimate_requests')
        .update(updates)
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async delete(requestId) {
      const { error } = await supabase
        .from('estimate_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      return { success: true };
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
  },

  // Work week plan operations
  workWeekPlans: {
    async getActive(userId) {
      const { data, error } = await supabase
        .from('work_week_plans')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateLoadStatus(planId, loadKey, loadStatus) {
      const { data: current, error: fetchErr } = await supabase
        .from('work_week_plans')
        .select('outbound_status, return_status')
        .eq('id', planId)
        .single();
      if (fetchErr) throw fetchErr;

      const merged = { ...current, [loadKey]: loadStatus };
      let planStatus = 'active';
      if (merged.outbound_status === 'hauled' && merged.return_status === 'hauled') {
        planStatus = 'completed';
      } else if (merged.outbound_status !== 'pending' || merged.return_status !== 'pending') {
        planStatus = 'in_progress';
      }

      const { data, error } = await supabase
        .from('work_week_plans')
        .update({ [loadKey]: loadStatus, status: planStatus, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async save({ userId, fleetId, weekDeadline, outboundLoad, returnLoad, chainSummary }) {
      // Deactivate any existing active plan first
      await supabase
        .from('work_week_plans')
        .update({ status: 'superseded' })
        .eq('user_id', userId)
        .eq('status', 'active');

      const { data, error } = await supabase
        .from('work_week_plans')
        .insert([{
          user_id: userId,
          fleet_id: fleetId || null,
          status: 'active',
          week_deadline: weekDeadline,
          outbound_load: outboundLoad,
          return_load: returnLoad,
          chain_summary: chainSummary,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateStatus(planId, status) {
      const { data, error } = await supabase
        .from('work_week_plans')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async getHauled(userId) {
      const { data, error } = await supabase
        .from('work_week_plans')
        .select('id, fleet_id, outbound_load, return_load, outbound_status, return_status, chain_summary, updated_at')
        .eq('user_id', userId)
        .or('outbound_status.eq.hauled,return_status.eq.hauled')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  }
};

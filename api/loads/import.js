import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * API endpoint to import loads from Chrome extension
 * POST /api/loads/import
 *
 * Body: { loads: [...], fleetId?: string }
 */
export default async function handler(req, res) {
  // CORS headers - allow Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify user is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - missing auth token' });
  }

  const userToken = authHeader.replace('Bearer ', '');

  // Create Supabase client to verify user
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the user's JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);

  if (authError || !user) {
    console.error('Auth verification failed:', authError);
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const { loads, fleetId } = req.body;

  if (!loads || !Array.isArray(loads) || loads.length === 0) {
    return res.status(400).json({ error: 'loads array is required' });
  }

  console.log(`📦 Importing ${loads.length} loads for user ${user.id}`);

  try {
    const results = {
      imported: 0,
      duplicates: 0,
      errors: 0,
      loads: []
    };

    for (const load of loads) {
      try {
        // Check for duplicate
        if (load.id || load.external_id) {
          const externalId = load.id || load.external_id;
          const { data: existing } = await supabase
            .from('imported_loads')
            .select('id')
            .eq('user_id', user.id)
            .eq('external_id', externalId)
            .eq('source', load.source || 'dat')
            .single();

          if (existing) {
            results.duplicates++;
            continue;
          }
        }

        // Transform extension data to database schema
        const loadRecord = transformLoadData(load, user.id, fleetId);

        const { data: inserted, error: insertError } = await supabase
          .from('imported_loads')
          .insert([loadRecord])
          .select()
          .single();

        if (insertError) {
          console.error('Failed to insert load:', insertError);
          results.errors++;
        } else {
          results.imported++;
          results.loads.push(inserted);
        }
      } catch (loadError) {
        console.error('Error processing load:', loadError);
        results.errors++;
      }
    }

    console.log(`✅ Import complete: ${results.imported} imported, ${results.duplicates} duplicates, ${results.errors} errors`);

    return res.status(200).json({
      success: true,
      message: `Imported ${results.imported} load(s)`,
      ...results
    });

  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({
      error: 'Failed to import loads',
      message: error.message
    });
  }
}

/**
 * Transform load data from extension format to database schema
 */
function transformLoadData(load, userId, fleetId) {
  // Parse origin city/state
  const originParts = parseLocation(load.origin || load.originCity);

  // Parse destination city/state
  const destParts = parseLocation(load.destination || load.destCity);

  // Parse rate
  let rate = null;
  let ratePerMile = null;
  if (load.rate) {
    rate = typeof load.rate === 'number' ? load.rate : parseFloat(String(load.rate).replace(/[$,]/g, ''));
  }
  if (load.trip && rate) {
    ratePerMile = Math.round((rate / load.trip) * 100) / 100;
  }

  // Parse weight
  let weight = null;
  if (load.weight) {
    weight = typeof load.weight === 'number' ? load.weight : parseInt(String(load.weight).replace(/[^0-9]/g, ''), 10);
  }

  // Parse length
  let length = null;
  if (load.length) {
    const lengthStr = String(load.length);
    const lengthMatch = lengthStr.match(/(\d+)/);
    if (lengthMatch) length = parseInt(lengthMatch[1], 10);
  }

  // Parse pickup date
  let pickupDate = null;
  if (load.pickup) {
    pickupDate = parsePickupDate(load.pickup);
  }

  return {
    user_id: userId,
    fleet_id: fleetId || null,
    external_id: load.id || null,
    source: load.source || 'dat',

    origin_city: originParts.city || load.originCity || 'Unknown',
    origin_state: originParts.state || load.originState || null,
    origin_lat: load.originLat || null,
    origin_lng: load.originLng || null,

    destination_city: destParts.city || load.destCity || 'Unknown',
    destination_state: destParts.state || load.destState || null,
    destination_lat: load.destLat || null,
    destination_lng: load.destLng || null,

    pickup_date: pickupDate,
    distance_miles: load.trip || null,
    rate: rate,
    rate_per_mile: ratePerMile,

    equipment_type: load.truck || null,
    full_partial: load.fp || null,
    weight_lbs: weight,
    length_ft: length,

    company_name: load.company || null,
    contact_phone: load.phone || load.contact || null,
    contact_email: load.email || null,
    credit_score: load.cs || null,
    days_to_pay: load.dtp || null,

    raw_data: load,
    status: 'available',
    posted_age: load.age || null,
    imported_at: load.importedAt || new Date().toISOString()
  };
}

/**
 * Parse location string into city and state
 */
function parseLocation(location) {
  if (!location) return { city: null, state: null };

  const parts = location.split(',').map(s => s.trim());
  return {
    city: parts[0] || null,
    state: parts[1] || null
  };
}

/**
 * Parse pickup date from various formats
 */
function parsePickupDate(dateStr) {
  if (!dateStr) return null;

  // Try MM/DD format (e.g., "07/17")
  const mmddMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmddMatch) {
    const year = new Date().getFullYear();
    const month = parseInt(mmddMatch[1], 10) - 1;
    const day = parseInt(mmddMatch[2], 10);
    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
  }

  // Try parsing as regular date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Ignore
  }

  return null;
}

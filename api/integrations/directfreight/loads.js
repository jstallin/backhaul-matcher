/**
 * GET /api/integrations/directfreight/loads
 *
 * Retrieves loads from the Direct Freight /boards/loads endpoint using the
 * stored token for the authenticated user.  Parameters are derived from the
 * open backhaul request (origin, destination, equipment type, date).
 *
 * TODO: Verify exact query parameter names against Direct Freight API docs.
 *       Map the response fields to the canonical load schema used by the app.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DF_BASE_URL = process.env.DIRECTFREIGHT_API_URL || 'https://api.directfreight.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  // Retrieve stored token
  const { data: integration, error: dbError } = await supabase
    .from('user_integrations')
    .select('access_token, token_expires_at, is_connected')
    .eq('user_id', user.id)
    .eq('provider', 'directfreight')
    .single();

  if (dbError || !integration?.is_connected || !integration?.access_token) {
    return res.status(400).json({ error: 'Direct Freight not connected', code: 'NOT_CONNECTED' });
  }

  if (integration.token_expires_at && new Date(integration.token_expires_at) < new Date()) {
    return res.status(401).json({ error: 'Direct Freight token expired — please reconnect', code: 'TOKEN_EXPIRED' });
  }

  // Pull search parameters from query string (sent by the client)
  const {
    origin_city,
    origin_state,
    dest_city,
    dest_state,
    equipment_type,
    pickup_date,
    radius_miles = '150'
  } = req.query;

  // Build the Direct Freight /boards/loads query params
  // TODO: Verify exact parameter names with Direct Freight API docs
  const params = new URLSearchParams({
    ...(origin_city && { origin_city }),
    ...(origin_state && { origin_state }),
    ...(dest_city && { dest_city }),
    ...(dest_state && { dest_state }),
    ...(equipment_type && { equipment: mapEquipmentType(equipment_type) }),
    ...(pickup_date && { date: pickup_date }),
    radius: radius_miles,
    limit: '100'
  });

  try {
    const dfRes = await fetch(`${DF_BASE_URL}/boards/loads?${params}`, {
      method: 'GET',
      headers: {
        // TODO: Verify exact auth header format — may be Bearer, Token, or custom
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!dfRes.ok) {
      const errBody = await dfRes.text();
      console.error('Direct Freight loads error:', dfRes.status, errBody);
      if (dfRes.status === 401) {
        // Mark token as expired in DB
        await supabase
          .from('user_integrations')
          .update({ is_connected: false, token_expires_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('provider', 'directfreight');
        return res.status(401).json({ error: 'Direct Freight token expired — please reconnect', code: 'TOKEN_EXPIRED' });
      }
      return res.status(502).json({ error: 'Failed to fetch loads from Direct Freight' });
    }

    const dfData = await dfRes.json();

    // TODO: Verify the exact response shape from Direct Freight
    // Normalize DF loads to the canonical app schema
    const rawLoads = dfData.loads || dfData.results || dfData.data || dfData || [];
    const loads = rawLoads.map(normalizeDfLoad).filter(Boolean);

    console.log(`✅ Direct Freight: ${loads.length} loads returned`);
    return res.status(200).json({ loads, source: 'directfreight', count: loads.length });

  } catch (err) {
    console.error('Direct Freight loads fetch error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * Map Direct Freight equipment type strings to the app's canonical names.
 * TODO: Update with actual DF equipment type codes from their API docs.
 */
function mapEquipmentType(appType) {
  const map = {
    'Dry Van': 'DV',
    'Flatbed': 'F',
    'Refrigerated': 'R',
    'Step Deck': 'SD',
    'Lowboy': 'LB'
  };
  return map[appType] || appType;
}

/**
 * Normalize a Direct Freight load object to the schema expected by
 * findRouteHomeBackhauls (same shape as demo backhaul_loads_data.json).
 *
 * TODO: Map actual DF field names once API docs are confirmed.
 */
function normalizeDfLoad(load) {
  if (!load) return null;

  try {
    // TODO: Adjust field names to match actual Direct Freight response
    const origin = load.origin || load.pickup || {};
    const destination = load.destination || load.delivery || {};
    const rate = load.rate || load.pay || {};
    const equipment = load.equipment || load.trailer || {};

    const pickupLat = parseFloat(origin.lat || origin.latitude || 0);
    const pickupLng = parseFloat(origin.lng || origin.longitude || 0);
    const deliveryLat = parseFloat(destination.lat || destination.latitude || 0);
    const deliveryLng = parseFloat(destination.lng || destination.longitude || 0);

    // Skip loads with no usable coordinates
    if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) return null;

    return {
      load_id:         load.id || load.load_id || load.loadId,
      broker:          load.broker || load.company || load.carrier || 'Direct Freight',
      shipper:         load.shipper || load.poster || '',
      receiver:        load.receiver || destination.name || '',
      freight_type:    load.commodity || load.freight_type || load.freightType || 'General',
      equipment_type:  equipment.type || equipment.name || load.equipment_type || 'Dry Van',
      equipment_code:  equipment.code || 'DV',
      pickup_city:     origin.city || '',
      pickup_state:    origin.state || '',
      pickup_lat:      pickupLat,
      pickup_lng:      pickupLng,
      pickup_date:     load.pickup_date || load.pickupDate || load.available_date || null,
      delivery_city:   destination.city || '',
      delivery_state:  destination.state || '',
      delivery_lat:    deliveryLat,
      delivery_lng:    deliveryLng,
      delivery_date:   load.delivery_date || load.deliveryDate || null,
      distance_miles:  parseFloat(load.miles || load.distance || load.distance_miles || 0),
      weight_lbs:      parseFloat(load.weight || load.weight_lbs || 0),
      trailer_length:  parseFloat(load.length || equipment.length || 53),
      total_revenue:   parseFloat(rate.total || rate.amount || load.rate || load.pay || 0),
      revenue_per_mile: parseFloat(rate.per_mile || rate.rate_per_mile || 0),
      status:          'available',
      posted_date:     load.posted_date || load.postedDate || new Date().toISOString()
    };
  } catch (err) {
    console.warn('Failed to normalize DF load:', err, load);
    return null;
  }
}

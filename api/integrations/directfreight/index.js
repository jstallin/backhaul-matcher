/**
 * /api/integrations/directfreight
 *
 * Single handler for all Direct Freight integration endpoints.
 * Routed by method + ?action= query param:
 *
 *   POST   ?action=auth    — authenticate with DF, store token
 *   DELETE ?action=auth    — disconnect (clear token)
 *   GET    ?action=status  — check connection status
 *   GET    ?action=loads   — fetch live loads from DF board
 *
 * TODO: Confirm exact DF API base URL, auth request/response field names,
 *       and /boards/loads query parameter names against DF API docs.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DF_BASE_URL = process.env.DIRECTFREIGHT_API_URL || 'https://api.directfreight.com';
const DF_API_TOKEN = process.env.DIRECTFREIGHT_API_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !supabaseServiceKey || !DF_API_TOKEN) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const { action } = req.query;

  // ── GET status ───────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    try {
      const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('is_connected, account_email, connected_at, token_expires_at')
        .eq('user_id', user.id)
        .eq('provider', 'directfreight')
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to check connection status' });
      }

      if (!integration || !integration.is_connected) {
        return res.status(200).json({ connected: false });
      }

      const isExpired = integration.token_expires_at
        ? new Date(integration.token_expires_at) < new Date()
        : false;

      return res.status(200).json({
        connected: !isExpired,
        is_expired: isExpired,
        username: integration.account_email,
        connected_at: integration.connected_at,
        expires_at: integration.token_expires_at
      });
    } catch (err) {
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

  // ── POST auth (connect) ───────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'auth') {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const dfRes = await fetch(`${DF_BASE_URL}/v1/end_user_authentications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-token': DF_API_TOKEN },
        body: JSON.stringify({ login: username, secret: password, realm: username.includes('@') ? 'email' : 'username' })
      });

      if (!dfRes.ok) {
        const errBody = await dfRes.text();
        console.error('Direct Freight auth failed:', dfRes.status, errBody);
        if (dfRes.status === 401 || dfRes.status === 403) {
          return res.status(400).json({ error: 'Invalid Direct Freight username or password' });
        }
        return res.status(502).json({ error: 'Direct Freight authentication failed' });
      }

      const dfData = await dfRes.json();
      const token = dfData['end-user-token'];
      const expiresAt = dfData.expires_at || dfData.expires
        ? new Date(dfData.expires_at || dfData.expires).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      if (!token) {
        console.error('Direct Freight auth response missing token:', dfData);
        return res.status(502).json({ error: 'Unexpected response from Direct Freight' });
      }

      const { error: dbError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          provider: 'directfreight',
          account_email: username,
          is_connected: true,
          access_token: token,
          token_expires_at: expiresAt,
          connected_at: new Date().toISOString(),
          metadata: { username }
        }, { onConflict: 'user_id,provider' });

      if (dbError) {
        console.error('Failed to save Direct Freight token:', dbError);
        return res.status(500).json({ error: 'Failed to save connection' });
      }

      console.log(`✅ Direct Freight connected for user ${user.id}`);
      return res.status(200).json({
        success: true,
        username,
        connected_at: new Date().toISOString(),
        expires_at: expiresAt
      });

    } catch (err) {
      console.error('Direct Freight auth error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

  // ── DELETE auth (disconnect) ──────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'auth') {
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({ is_connected: false, access_token: null, token_expires_at: null })
        .eq('user_id', user.id)
        .eq('provider', 'directfreight');

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to disconnect' });
      }

      console.log(`🔌 Direct Freight disconnected for user ${user.id}`);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

  // ── GET loads ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'loads') {
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

    const {
      origin_city, origin_state,
      dest_city, dest_state,
      equipment_type, pickup_date,
      radius_miles = '150'
    } = req.query;

    const searchBody = {
      ...(origin_city && { origin_city }),
      ...(origin_state && { origin_state }),
      ...(dest_city && { destination_city: dest_city }),
      ...(dest_state && { destination_state: dest_state }),
      ...(equipment_type && { trailer_type: mapEquipmentType(equipment_type) }),
      ...(pickup_date && { ship_date: pickup_date }),
      origin_radius: parseInt(radius_miles, 10),
      destination_radius: parseInt(radius_miles, 10),
      item_count: 100,
      full_load: true
    };

    try {
      const dfRes = await fetch(`${DF_BASE_URL}/v1/boards/loads`, {
        method: 'POST',
        headers: {
          'api-token': DF_API_TOKEN,
          'end-user-token': integration.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchBody)
      });

      if (!dfRes.ok) {
        const errBody = await dfRes.text();
        console.error('Direct Freight loads error:', dfRes.status, errBody);
        if (dfRes.status === 401) {
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
      const rawLoads = dfData.list || [];
      const loads = rawLoads.map(normalizeDfLoad).filter(Boolean);

      console.log(`✅ Direct Freight: ${loads.length} loads returned`);
      return res.status(200).json({ loads, source: 'directfreight', count: loads.length });

    } catch (err) {
      console.error('Direct Freight loads fetch error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}

function mapEquipmentType(appType) {
  const map = {
    'Dry Van': 'V',
    'Flatbed': 'F',
    'Refrigerated': 'R',
    'Step Deck': 'SD',
    'Lowboy': 'LB'
  };
  return map[appType] || appType;
}

/**
 * Normalize a Direct Freight board_response_item to the app's canonical schema.
 * Note: DF does not return lat/lng — pickup_lat/lng and delivery_lat/lng will be null.
 * The matching algorithm skips the haversine/corridor pre-filter when coords are absent,
 * relying on DF's own origin_radius/destination_radius filtering instead.
 */
function normalizeDfLoad(load) {
  if (!load) return null;
  try {
    if (!load.origin_city || !load.origin_state) return null;

    const trailerType = Array.isArray(load.trailer_type)
      ? load.trailer_type[0]
      : load.trailer_type || 'V';

    return {
      load_id:          load.entry_id,
      broker:           load.company_name || 'Direct Freight',
      shipper:          '',
      receiver:         '',
      freight_type:     load.commodity || 'General',
      equipment_type:   mapTrailerTypeToName(trailerType),
      equipment_code:   trailerType,
      pickup_city:      load.origin_city || '',
      pickup_state:     load.origin_state || '',
      pickup_lat:       null,
      pickup_lng:       null,
      pickup_date:      load.ship_date || null,
      delivery_city:    load.destination_city || '',
      delivery_state:   load.destination_state || '',
      delivery_lat:     null,
      delivery_lng:     null,
      delivery_date:    load.receive_date || null,
      distance_miles:   load.trip_miles || 0,
      weight_lbs:       load.weight || 0,
      trailer_length:   load.length || 53,
      total_revenue:    load.pay_rate || 0,
      revenue_per_mile: load.rate_per_mile_est || 0,
      status:           'available',
      posted_date:      new Date(Date.now() - (load.age || 0) * 60000).toISOString()
    };
  } catch (err) {
    console.warn('Failed to normalize DF load:', err);
    return null;
  }
}

function mapTrailerTypeToName(code) {
  const map = { 'V': 'Dry Van', 'F': 'Flatbed', 'R': 'Refrigerated', 'SD': 'Step Deck', 'LB': 'Lowboy' };
  return map[code] || code;
}

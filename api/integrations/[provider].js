/**
 * /api/integrations/[provider]
 *
 * Consolidated handler for all load board integrations.
 * Routes by the [provider] path segment: dat | truckstop | directfreight
 *
 * DAT:
 *   GET    — check connection status
 *   POST   — link DAT account (email)
 *   DELETE — disconnect
 *
 * Truckstop:
 *   GET    — check connection status (org token first, then user token)
 *   POST   — save API token (org-level for enterprise domains, user-level for free emails)
 *   DELETE — disconnect
 *
 * Direct Freight:
 *   GET    ?action=status  — check connection status
 *   GET    ?action=loads   — fetch live loads
 *   POST   ?action=auth    — authenticate and store token
 *   DELETE ?action=auth    — disconnect
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - missing auth token' });
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

  const { provider } = req.query;

  switch (provider) {
    case 'dat':         return handleDat(req, res, supabase, user);
    case 'truckstop':   return handleTruckstop(req, res, supabase, user);
    case 'directfreight': return handleDirectFreight(req, res, supabase, user);
    default:
      return res.status(404).json({ error: `Unknown provider: ${provider}` });
  }
}

// ─── DAT ──────────────────────────────────────────────────────────────────────

async function handleDat(req, res, supabase, user) {
  if (req.method === 'GET') {
    try {
      const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'dat')
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to check connection status' });
      }

      if (!integration) {
        return res.status(200).json({ connected: false, provider: 'dat' });
      }

      const isExpired = integration.token_expires_at
        ? new Date(integration.token_expires_at) < new Date()
        : false;

      return res.status(200).json({
        connected: integration.is_connected && !isExpired,
        provider: 'dat',
        account_email: integration.account_email,
        connected_at: integration.connected_at,
        expires_at: integration.token_expires_at,
        is_expired: isExpired,
        last_sync_at: integration.last_sync_at
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email) return res.status(400).json({ error: 'DAT email address is required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

    try {
      const { data: integration, error: dbError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          provider: 'dat',
          account_email: email.toLowerCase().trim(),
          is_connected: true,
          connected_at: new Date().toISOString(),
          metadata: { auth_type: 'service_account', linked_at: new Date().toISOString() }
        }, { onConflict: 'user_id,provider', ignoreDuplicates: false })
        .select()
        .single();

      if (dbError) {
        console.error('Failed to save DAT integration:', dbError);
        return res.status(500).json({ error: 'Failed to link DAT account', code: 'DB_ERROR' });
      }

      console.log(`✅ DAT account linked: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'DAT account linked successfully',
        account_email: integration.account_email,
        connected_at: integration.connected_at
      });
    } catch (err) {
      return res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({ is_connected: false, access_token: null, refresh_token: null, token_expires_at: null })
        .eq('user_id', user.id)
        .eq('provider', 'dat');

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to disconnect' });
      }

      console.log(`🔌 DAT disconnected for user ${user.id}`);
      return res.status(200).json({ success: true, message: 'DAT account disconnected successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── TRUCKSTOP ────────────────────────────────────────────────────────────────

async function handleTruckstop(req, res, supabase, user) {
  // Look up user's org membership (org_id + role)
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const orgId = membership?.org_id || null;
  const isOrgAdmin = membership?.role === 'admin';

  if (req.method === 'GET') {
    try {
      // Check org-level token first
      if (orgId) {
        const { data: orgToken, error: orgError } = await supabase
          .from('org_integrations')
          .select('*')
          .eq('org_id', orgId)
          .eq('provider', 'truckstop')
          .single();

        if (orgError && orgError.code !== 'PGRST116') {
          return res.status(500).json({ error: 'Failed to check connection status' });
        }

        if (orgToken) {
          return res.status(200).json({
            connected: true,
            provider: 'truckstop',
            is_org_token: true,
            username: orgToken.username,
            connected_at: orgToken.created_at
          });
        }
      }

      const { data: userToken, error: userError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'truckstop')
        .single();

      if (userError && userError.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to check connection status' });
      }

      if (!userToken || !userToken.is_connected) {
        return res.status(200).json({ connected: false, provider: 'truckstop', is_org_token: false });
      }

      return res.status(200).json({
        connected: true,
        provider: 'truckstop',
        is_org_token: false,
        username: userToken.account_email,
        connected_at: userToken.connected_at
      });
    } catch (err) {
      console.error('Truckstop GET error:', err);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  if (req.method === 'POST') {
    const { api_token, username, password } = req.body || {};

    if (!api_token?.trim()) return res.status(400).json({ error: 'API token is required' });
    if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required' });

    const token = api_token.trim();
    const uname = username.trim();

    try {
      if (orgId && isOrgAdmin) {
        // Org admin — save as org-level token
        const { error: orgError } = await supabase
          .from('org_integrations')
          .upsert({
            org_id: orgId,
            provider: 'truckstop',
            api_token: token,
            username: uname,
            password: password.trim(),
            connected_by: user.id
          }, { onConflict: 'org_id,provider', ignoreDuplicates: false });

        if (orgError) {
          console.error('Failed to save org Truckstop token:', orgError);
          return res.status(500).json({ error: 'Failed to save credentials', code: 'DB_ERROR' });
        }

        console.log(`✅ Truckstop org credentials saved for org: ${orgId}`);
        return res.status(200).json({
          success: true,
          message: 'Truckstop connected for your organization',
          is_org_token: true,
          username: uname
        });
      } else if (orgId && !isOrgAdmin) {
        return res.status(403).json({ error: 'Only org admins can set the organization Truckstop token' });
      } else {
        // No org — save as user-level token
        const { error: userError } = await supabase
          .from('user_integrations')
          .upsert({
            user_id: user.id,
            provider: 'truckstop',
            access_token: token,
            account_email: uname,
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: { auth_type: 'api_token', password: password.trim(), linked_at: new Date().toISOString() }
          }, { onConflict: 'user_id,provider', ignoreDuplicates: false });

        if (userError) {
          console.error('Failed to save user Truckstop credentials:', userError);
          return res.status(500).json({ error: 'Failed to save credentials', code: 'DB_ERROR' });
        }

        console.log(`✅ Truckstop user credentials saved for user: ${user.id}`);
        return res.status(200).json({ success: true, message: 'Truckstop connected successfully', is_org_token: false, username: uname });
      }
    } catch (err) {
      console.error('Truckstop POST error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (orgId && isOrgAdmin) {
        const { error } = await supabase
          .from('org_integrations')
          .delete()
          .eq('org_id', orgId)
          .eq('provider', 'truckstop');

        if (error && error.code !== 'PGRST116') {
          return res.status(500).json({ error: 'Failed to disconnect' });
        }
      } else if (orgId && !isOrgAdmin) {
        return res.status(403).json({ error: 'Only org admins can disconnect the organization Truckstop token' });
      }

      await supabase
        .from('user_integrations')
        .update({ is_connected: false, access_token: null })
        .eq('user_id', user.id)
        .eq('provider', 'truckstop');

      console.log(`🔌 Truckstop disconnected for user ${user.id} (org: ${orgId})`);
      return res.status(200).json({ success: true, message: 'Truckstop disconnected' });
    } catch (err) {
      console.error('Truckstop DELETE error:', err);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
  }

  // ── GET loads ───────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'loads') {
    // Retrieve stored credentials — org token takes priority over user token
    let apiToken, username, password;

    if (orgId) {
      const { data: orgRow } = await supabase
        .from('org_integrations')
        .select('api_token, username, password')
        .eq('org_id', orgId)
        .eq('provider', 'truckstop')
        .single();

      if (orgRow?.api_token) {
        apiToken = orgRow.api_token;
        username = orgRow.username;
        password = orgRow.password;
      }
    }

    if (!apiToken) {
      const { data: userRow } = await supabase
        .from('user_integrations')
        .select('access_token, account_email, metadata')
        .eq('user_id', user.id)
        .eq('provider', 'truckstop')
        .eq('is_connected', true)
        .single();

      if (userRow?.access_token) {
        apiToken = userRow.access_token;
        username = userRow.account_email;
        password = userRow.metadata?.password;
      }
    }

    if (!apiToken) {
      return res.status(400).json({ error: 'Truckstop not connected', code: 'NOT_CONNECTED' });
    }

    const {
      origin_city, origin_state,
      dest_city, dest_state,
      equipment_type,
      pickup_date,
      radius_miles = '150'
    } = req.query;

    try {
      const loads = await fetchTruckstopLoads({
        apiToken, username, password,
        originCity: origin_city,
        originState: origin_state,
        destCity: dest_city,
        destState: dest_state,
        equipmentType: equipment_type,
        pickupDate: pickup_date,
        radiusMiles: parseInt(radius_miles, 10)
      });

      console.log(`✅ Truckstop: ${loads.length} loads returned`);
      return res.status(200).json({ loads, source: 'truckstop', count: loads.length });
    } catch (err) {
      console.error('Truckstop loads fetch error:', err);
      if (err.code === 'UNAUTHORIZED') {
        return res.status(401).json({ error: 'Truckstop credentials invalid or expired — please reconnect', code: 'TOKEN_EXPIRED' });
      }
      return res.status(502).json({ error: 'Failed to fetch loads from Truckstop' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── TRUCKSTOP LOAD FETCH + NORMALIZATION ─────────────────────────────────────

// TODO: verify base URL against Truckstop API docs
const TS_BASE_URL = process.env.TRUCKSTOP_API_URL || 'https://api.integration.truckstop.com';

/**
 * Fetch loads from Truckstop API and return normalized load objects.
 *
 * All field names, endpoint paths, and request/response shapes below are
 * informed guesses based on REST load board API conventions.
 * TODO: verify every marked item against actual Truckstop API documentation.
 */
async function fetchTruckstopLoads({
  apiToken, username, password,
  originCity, originState,
  destCity, destState,
  equipmentType, pickupDate,
  radiusMiles = 150
}) {
  // TODO: verify auth mechanism — Truckstop may use Bearer token, x-api-key header,
  // or OAuth 2.0 client credentials flow using username/password to obtain a session token.
  // If OAuth, add a token-exchange step here before the load search call.
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiToken}`, // TODO: verify header name and format
  };

  // TODO: verify search endpoint path and HTTP method
  const searchBody = {
    origin: {
      city:   originCity  || '',
      state:  originState || '',
      radius: radiusMiles,          // TODO: verify radius units (miles assumed)
    },
    destination: {
      city:  destCity  || '',
      state: destState || '',
      radius: radiusMiles,
    },
    // TODO: verify equipment type values — Truckstop may use codes like 'V', 'F', 'R'
    // or full names like 'Van', 'Flatbed', 'Reefer'
    equipmentTypes: equipmentType ? [mapTsEquipmentType(equipmentType)] : [],
    ...(pickupDate && { pickupDate }),  // TODO: verify date field name and format (ISO 8601 assumed)
    limit: 100,                         // TODO: verify pagination field name
    fullLoadsOnly: true,                // TODO: verify field name and whether this param exists
  };

  const tsRes = await fetch(`${TS_BASE_URL}/v2/loadboard/loads/search`, { // TODO: verify path
    method: 'POST',
    headers,
    body: JSON.stringify(searchBody)
  });

  if (!tsRes.ok) {
    const errText = await tsRes.text().catch(() => '');
    console.error('Truckstop API error:', tsRes.status, errText);
    if (tsRes.status === 401 || tsRes.status === 403) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    throw new Error(`Truckstop API returned ${tsRes.status}`);
  }

  const tsData = await tsRes.json();

  // TODO: verify top-level response shape — may be { loads: [] }, { data: { items: [] } }, etc.
  const rawLoads = tsData.loads || tsData.data?.loads || tsData.items || tsData.data || [];

  return Array.isArray(rawLoads) ? rawLoads.map(normalizeTsLoad).filter(Boolean) : [];
}

/**
 * Map app equipment type names to Truckstop API codes/values.
 * TODO: verify exact values against Truckstop API documentation.
 */
function mapTsEquipmentType(appType) {
  const map = {
    'Dry Van':      'V',      // TODO: verify
    'Flatbed':      'F',      // TODO: verify
    'Refrigerated': 'R',      // TODO: verify
    'Step Deck':    'SD',     // TODO: verify
    'Lowboy':       'LB',     // TODO: verify
  };
  return map[appType] || appType;
}

/**
 * Normalize a Truckstop API load object to the app's canonical schema.
 * All field paths below are guesses — TODO: verify each against actual API response.
 */
function normalizeTsLoad(load) {
  if (!load) return null;
  try {
    // TODO: verify origin/destination field structure
    const origin = load.origin || load.pickup || {};
    const dest   = load.destination || load.delivery || {};

    if (!origin.city || !origin.state) return null;

    // TODO: verify rate field structure — may be { ratePerMile, totalRate } or flat fields
    const totalRevenue    = load.rate?.total      ?? load.totalRate     ?? load.rate ?? 0;
    const revenuePerMile  = load.rate?.perMile    ?? load.ratePerMile   ?? 0;

    // TODO: verify equipment field path
    const equipCode = load.equipment?.type ?? load.equipmentType ?? load.trailerType ?? '';

    return {
      load_id:          load.loadId      ?? load.id ?? load.load_id,
      broker:           load.broker?.name ?? load.company ?? load.postedBy ?? 'Truckstop',
      shipper:          '',
      receiver:         '',
      freight_type:     load.commodity   ?? load.freightDescription ?? 'General',
      equipment_type:   mapTsEquipmentTypeToName(equipCode),
      equipment_code:   equipCode,
      pickup_city:      origin.city    ?? '',
      pickup_state:     origin.state   ?? '',
      pickup_lat:       origin.latitude  ?? origin.lat ?? null,   // TODO: verify field names
      pickup_lng:       origin.longitude ?? origin.lng ?? null,
      pickup_date:      load.pickupDate  ?? load.shipDate  ?? null,
      delivery_city:    dest.city    ?? '',
      delivery_state:   dest.state   ?? '',
      delivery_lat:     dest.latitude  ?? dest.lat ?? null,
      delivery_lng:     dest.longitude ?? dest.lng ?? null,
      delivery_date:    load.deliveryDate ?? load.receiveDate ?? null,
      distance_miles:   load.mileage  ?? load.distance ?? load.tripMiles ?? 0,
      weight_lbs:       load.weight   ?? 0,
      trailer_length:   load.length   ?? load.trailerLength ?? 53,
      total_revenue:    totalRevenue,
      revenue_per_mile: revenuePerMile,
      status:           'available',
      posted_date:      load.postedDate ?? load.createdAt ?? new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Failed to normalize Truckstop load:', err);
    return null;
  }
}

function mapTsEquipmentTypeToName(code) {
  const map = { 'V': 'Dry Van', 'F': 'Flatbed', 'R': 'Refrigerated', 'SD': 'Step Deck', 'LB': 'Lowboy' };
  return map[code] || code;
}

// ─── DIRECT FREIGHT ───────────────────────────────────────────────────────────

const DF_BASE_URL = process.env.DIRECTFREIGHT_API_URL || 'https://api.directfreight.com';
const DF_API_TOKEN = process.env.DIRECTFREIGHT_API_TOKEN;

async function handleDirectFreight(req, res, supabase, user) {
  if (!DF_API_TOKEN) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { action } = req.query;

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
      return res.status(200).json({ success: true, username, connected_at: new Date().toISOString(), expires_at: expiresAt });
    } catch (err) {
      console.error('Direct Freight auth error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

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
      ...(equipment_type && { trailer_type: mapDfEquipmentType(equipment_type) }),
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

function mapDfEquipmentType(appType) {
  const map = { 'Dry Van': 'V', 'Flatbed': 'F', 'Refrigerated': 'R', 'Step Deck': 'SD', 'Lowboy': 'LB' };
  return map[appType] || appType;
}

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
      equipment_type:   mapDfTrailerTypeToName(trailerType),
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

function mapDfTrailerTypeToName(code) {
  const map = { 'V': 'Dry Van', 'F': 'Flatbed', 'R': 'Refrigerated', 'SD': 'Step Deck', 'LB': 'Lowboy' };
  return map[code] || code;
}

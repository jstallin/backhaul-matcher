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

// Free email domains — users with these require individual tokens (not org-shared)
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'pm.me',
  'ymail.com', 'msn.com', 'googlemail.com'
]);

function getEmailDomain(email) {
  return email?.split('@')[1]?.toLowerCase() || '';
}

function isOrgDomain(domain) {
  return domain && !FREE_EMAIL_DOMAINS.has(domain);
}

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
  const userDomain = getEmailDomain(user.email);
  const orgLevel = isOrgDomain(userDomain);

  if (req.method === 'GET') {
    try {
      if (orgLevel) {
        const { data: orgToken, error: orgError } = await supabase
          .from('org_integrations')
          .select('*')
          .eq('email_domain', userDomain)
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
            org_domain: userDomain,
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
        return res.status(200).json({
          connected: false,
          provider: 'truckstop',
          is_org_token: false,
          org_domain: orgLevel ? userDomain : null
        });
      }

      return res.status(200).json({
        connected: true,
        provider: 'truckstop',
        is_org_token: false,
        org_domain: orgLevel ? userDomain : null,
        connected_at: userToken.connected_at
      });
    } catch (err) {
      console.error('Truckstop GET error:', err);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  if (req.method === 'POST') {
    const { api_token } = req.body || {};

    if (!api_token?.trim()) {
      return res.status(400).json({ error: 'API token is required' });
    }

    const token = api_token.trim();

    try {
      if (orgLevel) {
        const { error: orgError } = await supabase
          .from('org_integrations')
          .upsert({
            email_domain: userDomain,
            provider: 'truckstop',
            api_token: token,
            connected_by: user.id
          }, { onConflict: 'email_domain,provider', ignoreDuplicates: false });

        if (orgError) {
          console.error('Failed to save org Truckstop token:', orgError);
          return res.status(500).json({ error: 'Failed to save API token', code: 'DB_ERROR' });
        }

        console.log(`✅ Truckstop org token saved for domain: ${userDomain}`);
        return res.status(200).json({
          success: true,
          message: `Truckstop connected for all ${userDomain} users`,
          is_org_token: true,
          org_domain: userDomain
        });
      } else {
        const { error: userError } = await supabase
          .from('user_integrations')
          .upsert({
            user_id: user.id,
            provider: 'truckstop',
            access_token: token,
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: { auth_type: 'api_token', linked_at: new Date().toISOString() }
          }, { onConflict: 'user_id,provider', ignoreDuplicates: false });

        if (userError) {
          console.error('Failed to save user Truckstop token:', userError);
          return res.status(500).json({ error: 'Failed to save API token', code: 'DB_ERROR' });
        }

        console.log(`✅ Truckstop user token saved for user: ${user.id}`);
        return res.status(200).json({ success: true, message: 'Truckstop connected successfully', is_org_token: false });
      }
    } catch (err) {
      console.error('Truckstop POST error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (orgLevel) {
        const { error } = await supabase
          .from('org_integrations')
          .delete()
          .eq('email_domain', userDomain)
          .eq('provider', 'truckstop');

        if (error && error.code !== 'PGRST116') {
          return res.status(500).json({ error: 'Failed to disconnect' });
        }
      }

      await supabase
        .from('user_integrations')
        .update({ is_connected: false, access_token: null })
        .eq('user_id', user.id)
        .eq('provider', 'truckstop');

      console.log(`🔌 Truckstop disconnected for user ${user.id} (domain: ${userDomain})`);
      return res.status(200).json({ success: true, message: 'Truckstop disconnected' });
    } catch (err) {
      console.error('Truckstop DELETE error:', err);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
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

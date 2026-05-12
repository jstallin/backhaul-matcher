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
import { Resend } from 'resend';
import { XMLParser } from 'fast-xml-parser';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DAT_DEBUG_EMAIL = 'jason@haulmonitor.cloud';

// ─── DAT TRACE LOGGER ─────────────────────────────────────────────────────────
// Collects structured trace events during a DAT API interaction and emails them
// to DAT_DEBUG_EMAIL when the dat_debug_email admin setting is enabled.

function createDatTracer(requestId) {
  const events = [];
  const startTime = Date.now();

  const trace = (event, data = {}) => {
    const entry = {
      t: `+${Date.now() - startTime}ms`,
      event,
      ...data,
    };
    events.push(entry);
    console.log(`[DAT TRACE ${requestId}]`, event, data);
  };

  const sanitizeToken = (token) => {
    if (!token) return '(none)';
    if (token.length <= 8) return '***';
    return token.slice(0, 4) + '***' + token.slice(-4);
  };

  const sendEmail = async (supabase, context) => {
    try {
      // Check admin setting
      const { data: setting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'dat_debug_email')
        .maybeSingle();

      if (!setting?.value?.enabled) return;

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.warn('[DAT TRACE] Resend key not configured — skipping debug email');
        return;
      }

      const totalMs = Date.now() - startTime;
      const lines = events.map(e => {
        const data = { ...e };
        delete data.t;
        delete data.event;
        const dataStr = Object.keys(data).length
          ? '\n    ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n    ')
          : '';
        return `  [${e.t}] ${e.event}${dataStr}`;
      });

      const subject = `[DAT Debug] ${context.method} ${context.action || ''} — ${context.userEmail} — ${new Date().toISOString()}`;

      const text = [
        '━━━ DAT API Debug Trace ━━━',
        `Request ID : ${requestId}`,
        `Timestamp  : ${new Date().toISOString()}`,
        `User       : ${context.userEmail} (${context.userId})`,
        `Method     : ${context.method}`,
        `Action     : ${context.action || '(none)'}`,
        `Duration   : ${totalMs}ms`,
        '',
        '── Trace Events ──',
        ...lines,
        '',
        '── Raw Context ──',
        JSON.stringify(context, null, 2),
      ].join('\n');

      const html = `<pre style="font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`;

      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: 'Haul Monitor <notifications@haulmonitor.cloud>',
        to: [DAT_DEBUG_EMAIL],
        subject,
        text,
        html,
      });

      console.log(`[DAT TRACE ${requestId}] Debug email sent to ${DAT_DEBUG_EMAIL}`);
    } catch (err) {
      console.error(`[DAT TRACE ${requestId}] Failed to send debug email:`, err.message);
    }
  };

  return { trace, sanitizeToken, sendEmail };
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
  const requestId = `dat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { trace, sanitizeToken, sendEmail } = createDatTracer(requestId);

  const context = {
    requestId,
    method: req.method,
    action: req.query.action || null,
    userId: user.id,
    userEmail: user.email,
    queryParams: { ...req.query },
    bodyKeys: req.body ? Object.keys(req.body) : [],
  };

  trace('DAT handler entered', { method: req.method, action: req.query.action });

  if (req.method === 'GET') {
    try {
      trace('Querying user_integrations for DAT record');
      const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'dat')
        .single();

      if (error && error.code !== 'PGRST116') {
        trace('DB error fetching integration', { code: error.code, message: error.message });
        await sendEmail(supabase, { ...context, outcome: 'db_error', error: error.message });
        return res.status(500).json({ error: 'Failed to check connection status' });
      }

      if (!integration) {
        trace('No DAT integration record found — reporting not connected');
        await sendEmail(supabase, { ...context, outcome: 'not_connected' });
        return res.status(200).json({ connected: false, provider: 'dat' });
      }

      const isExpired = integration.token_expires_at
        ? new Date(integration.token_expires_at) < new Date()
        : false;

      trace('Integration record found', {
        is_connected: integration.is_connected,
        is_expired: isExpired,
        has_access_token: !!integration.access_token,
        access_token_preview: sanitizeToken(integration.access_token),
        token_expires_at: integration.token_expires_at,
        connected_at: integration.connected_at,
        last_sync_at: integration.last_sync_at,
        account_email: integration.account_email,
        metadata_keys: integration.metadata ? Object.keys(integration.metadata) : [],
      });

      await sendEmail(supabase, { ...context, outcome: 'status_returned', is_connected: integration.is_connected, is_expired: isExpired });

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
      trace('Unexpected error in GET', { message: err.message, stack: err.stack });
      await sendEmail(supabase, { ...context, outcome: 'exception', error: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  if (req.method === 'POST') {
    const { email, api_token } = req.body || {};
    trace('POST body received', {
      has_email: !!email,
      email_value: email || '(none)',
      has_api_token: !!api_token,
      api_token_preview: sanitizeToken(api_token),
      all_body_keys: Object.keys(req.body || {}),
    });

    if (!email) {
      trace('Validation failed — missing email');
      await sendEmail(supabase, { ...context, outcome: 'validation_error', reason: 'missing_email' });
      return res.status(400).json({ error: 'DAT email address is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      trace('Validation failed — invalid email format', { email });
      await sendEmail(supabase, { ...context, outcome: 'validation_error', reason: 'invalid_email_format', email });
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    trace('Upserting DAT integration record', { email: email.toLowerCase().trim(), has_token: !!api_token });

    try {
      const upsertPayload = {
        user_id: user.id,
        provider: 'dat',
        account_email: email.toLowerCase().trim(),
        is_connected: true,
        connected_at: new Date().toISOString(),
        metadata: { auth_type: 'service_account', linked_at: new Date().toISOString() },
        ...(api_token ? { access_token: api_token.trim() } : {}),
      };

      trace('Upsert payload built', {
        ...upsertPayload,
        access_token: sanitizeToken(upsertPayload.access_token),
      });

      const { data: integration, error: dbError } = await supabase
        .from('user_integrations')
        .upsert(upsertPayload, { onConflict: 'user_id,provider', ignoreDuplicates: false })
        .select()
        .single();

      if (dbError) {
        trace('DB upsert failed', { code: dbError.code, message: dbError.message, details: dbError.details });
        await sendEmail(supabase, { ...context, outcome: 'db_error', error: dbError.message, code: dbError.code });
        return res.status(500).json({ error: 'Failed to link DAT account', code: 'DB_ERROR' });
      }

      trace('DAT integration saved successfully', {
        account_email: integration.account_email,
        connected_at: integration.connected_at,
        has_stored_token: !!integration.access_token,
      });

      console.log(`✅ DAT account linked: ${email}`);
      await sendEmail(supabase, { ...context, outcome: 'linked_successfully', account_email: integration.account_email });

      return res.status(200).json({
        success: true,
        message: 'DAT account linked successfully',
        account_email: integration.account_email,
        connected_at: integration.connected_at
      });
    } catch (err) {
      trace('Unexpected error in POST', { message: err.message, stack: err.stack });
      await sendEmail(supabase, { ...context, outcome: 'exception', error: err.message, stack: err.stack });
      return res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    trace('Disconnecting DAT integration');
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({ is_connected: false, access_token: null, refresh_token: null, token_expires_at: null })
        .eq('user_id', user.id)
        .eq('provider', 'dat');

      if (error && error.code !== 'PGRST116') {
        trace('DB error on disconnect', { code: error.code, message: error.message });
        await sendEmail(supabase, { ...context, outcome: 'db_error', error: error.message });
        return res.status(500).json({ error: 'Failed to disconnect' });
      }

      trace('DAT integration disconnected');
      console.log(`🔌 DAT disconnected for user ${user.id}`);
      await sendEmail(supabase, { ...context, outcome: 'disconnected' });
      return res.status(200).json({ success: true, message: 'DAT account disconnected successfully' });
    } catch (err) {
      trace('Unexpected error in DELETE', { message: err.message, stack: err.stack });
      await sendEmail(supabase, { ...context, outcome: 'exception', error: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
  }

  trace('Method not allowed', { method: req.method });
  await sendEmail(supabase, { ...context, outcome: 'method_not_allowed' });
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
    const { username, password } = req.body || {};

    if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required' });

    const uname = username.trim();

    try {
      if (orgId && isOrgAdmin) {
        // Org admin — save as org-level credentials
        const { error: orgError } = await supabase
          .from('org_integrations')
          .upsert({
            org_id: orgId,
            provider: 'truckstop',
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
        // No org — save as user-level credentials
        const { error: userError } = await supabase
          .from('user_integrations')
          .upsert({
            user_id: user.id,
            provider: 'truckstop',
            account_email: uname,
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: { username: uname, password: password.trim(), linked_at: new Date().toISOString() }
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
    const integrationId = process.env.TRUCKSTOP_INTEGRATION_ID;
    if (!integrationId) {
      return res.status(500).json({ error: 'Truckstop Integration ID not configured' });
    }

    let username, password;

    if (orgId) {
      const { data: orgRow } = await supabase
        .from('org_integrations')
        .select('username, password')
        .eq('org_id', orgId)
        .eq('provider', 'truckstop')
        .single();

      if (orgRow?.username) {
        username = orgRow.username;
        password = orgRow.password;
      }
    }

    if (!username) {
      const { data: userRow } = await supabase
        .from('user_integrations')
        .select('account_email, metadata')
        .eq('user_id', user.id)
        .eq('provider', 'truckstop')
        .eq('is_connected', true)
        .single();

      if (userRow?.account_email) {
        username = userRow.account_email;
        password = userRow.metadata?.password;
      }
    }

    if (!username) {
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
        integrationId, username, password,
        originCity: origin_city,
        originState: origin_state,
        destCity: dest_city,
        destState: dest_state,
        equipmentType: equipment_type,
        pickupDate: pickup_date,
        radiusMiles: parseInt(radius_miles, 10),
      });

      console.log(`✅ Truckstop: ${loads.length} loads returned`);
      return res.status(200).json({ loads, source: 'truckstop', count: loads.length });
    } catch (err) {
      console.error('Truckstop loads fetch error:', err);
      if (err.code === 'UNAUTHORIZED') {
        return res.status(401).json({ error: 'Truckstop credentials invalid — please reconnect', code: 'TOKEN_EXPIRED' });
      }
      return res.status(502).json({ error: 'Failed to fetch loads from Truckstop' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── TRUCKSTOP SOAP IMPLEMENTATION ────────────────────────────────────────────

// Set TRUCKSTOP_BASE_URL=https://webservices.truckstop.com in production Vercel env
const TS_BASE_URL = process.env.TRUCKSTOP_BASE_URL || 'https://testws.truckstop.com';
const TS_ENDPOINT = `${TS_BASE_URL}/v13/Searching/LoadSearch.svc`;
const TS_SOAP_ACTION = 'http://webservices.truckstop.com/v12/ILoadSearch/GetLoadSearchResults';

// App equipment type names → Truckstop codes
const EQUIP_TO_TS = {
  'Dry Van':      'V',
  'Flatbed':      'F',
  'Refrigerated': 'R',
  'Step Deck':    'SD',
  'Lowboy':       'LB',
};

// Truckstop codes → app equipment type names
const TS_TO_EQUIP = {
  'V': 'Dry Van', 'VF': 'Dry Van', 'VB': 'Dry Van',
  'F': 'Flatbed', 'FF': 'Flatbed',
  'R': 'Refrigerated', 'RVF': 'Refrigerated', 'RV': 'Refrigerated',
  'SD': 'Step Deck', 'SDF': 'Step Deck',
  'LB': 'Lowboy',
  'DD': 'Double Drop',
  'TNK': 'Tanker',
  'IM': 'Intermodal',
};

function buildSoapEnvelope({ integrationId, username, password, originCity, originState, destCity, destState, equipmentType, pickupDate, radiusMiles }) {
  const equip = equipmentType ? EQUIP_TO_TS[equipmentType] || equipmentType : '';
  const pickupXml = pickupDate
    ? `<web1:PickupDates><arr:dateTime>${pickupDate}</arr:dateTime></web1:PickupDates>`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:v12="http://webservices.truckstop.com/v12"
  xmlns:web="http://schemas.datacontract.org/2004/07/WebServices"
  xmlns:web1="http://schemas.datacontract.org/2004/07/WebServices.Searching"
  xmlns:arr="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
  <soapenv:Header/>
  <soapenv:Body>
    <v12:GetLoadSearchResults>
      <v12:searchRequest>
        <web:IntegrationId>${integrationId}</web:IntegrationId>
        <web:Password>${escapeXml(password)}</web:Password>
        <web:UserName>${escapeXml(username)}</web:UserName>
        <web1:Criteria>
          ${destCity  ? `<web1:DestinationCity>${escapeXml(destCity)}</web1:DestinationCity>` : ''}
          <web1:DestinationCountry>usa</web1:DestinationCountry>
          <web1:DestinationRange>${radiusMiles}</web1:DestinationRange>
          ${destState ? `<web1:DestinationState>${destState.toLowerCase()}</web1:DestinationState>` : ''}
          ${equip     ? `<web1:EquipmentType>${equip}</web1:EquipmentType>` : ''}
          <web1:LoadType>Full</web1:LoadType>
          ${originCity  ? `<web1:OriginCity>${escapeXml(originCity)}</web1:OriginCity>` : ''}
          <web1:OriginCountry>usa</web1:OriginCountry>
          ${originState ? `<web1:OriginState>${originState.toLowerCase()}</web1:OriginState>` : ''}
          <web1:PageNumber>1</web1:PageNumber>
          <web1:PageSize>100</web1:PageSize>
          ${pickupXml}
          <web1:SortDescending>false</web1:SortDescending>
        </web1:Criteria>
      </v12:searchRequest>
    </v12:GetLoadSearchResults>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchTruckstopLoads({ integrationId, username, password, originCity, originState, destCity, destState, equipmentType, pickupDate, radiusMiles = 150 }) {
  const envelope = buildSoapEnvelope({ integrationId, username, password, originCity, originState, destCity, destState, equipmentType, pickupDate, radiusMiles });

  const tsRes = await fetch(TS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'Accept': 'text/xml',
      'SOAPAction': TS_SOAP_ACTION,
    },
    body: envelope,
  });

  const responseText = await tsRes.text();

  if (!tsRes.ok) {
    console.error('Truckstop SOAP error:', tsRes.status, responseText.slice(0, 500));
    if (tsRes.status === 401 || tsRes.status === 403 || responseText.includes('Unauthorized')) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    throw new Error(`Truckstop API returned ${tsRes.status}`);
  }

  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(responseText);

  const result = parsed?.Envelope?.Body?.GetLoadSearchResultsResponse?.GetLoadSearchResultsResult;

  // Surface API-level errors (bad credentials, invalid integration ID, etc.)
  const errors = result?.Errors;
  if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
    console.error('[Truckstop] API errors in response:', JSON.stringify(errors));
    const err = new Error('Truckstop API returned errors');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const rawLoads = toArray(result?.SearchResults?.LoadSearchItem);
  console.log(`[Truckstop] Parsed ${rawLoads.length} load records from SOAP response`);
  return rawLoads.map(normalizeTsLoad).filter(Boolean);
}

// Ensure a value is always an array (SOAP returns a single object when there's 1 result)
function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Parse Truckstop date format "11/11/24" → "2024-11-11"
function parseTsDate(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 3) return str;
  const [m, d, y] = parts;
  const year = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function normalizeTsLoad(load) {
  if (!load) return null;
  try {
    const originCity  = load.OriginCity  ?? '';
    const originState = load.OriginState ?? '';
    if (!originCity && !originState) return null;

    const equipCode = load.Equipment ?? '';
    const payment   = parseFloat(String(load.Payment  ?? '0').replace(/[^0-9.]/g, '')) || 0;
    const miles     = parseInt(load.Miles ?? 0, 10);
    const rpm       = miles > 0 ? Math.round((payment / miles) * 100) / 100 : 0;

    // Days2Pay comes as "----" when unknown
    const days2PayRaw = String(load.Days2Pay ?? '');
    const daysToPay   = /^\d+$/.test(days2PayRaw) ? parseInt(days2PayRaw, 10) : null;

    return {
      load_id:          String(load.ID),
      broker:           load.CompanyName ?? 'Truckstop',
      freight_type:     'General',
      equipment_type:   TS_TO_EQUIP[equipCode] ?? equipCode,
      equipment_code:   equipCode,
      pickup_city:      originCity,
      pickup_state:     originState,
      pickup_lat:       null,
      pickup_lng:       null,
      pickup_date:      parseTsDate(load.PickUpDate),
      delivery_city:    load.DestinationCity  ?? '',
      delivery_state:   load.DestinationState ?? '',
      delivery_lat:     null,
      delivery_lng:     null,
      delivery_date:    null,
      distance_miles:   miles,
      weight_lbs:       parseInt(load.Weight ?? 0, 10),
      trailer_length:   parseFloat(load.Length ?? 53),
      total_revenue:    payment,
      revenue_per_mile: rpm,
      days_to_pay:      daysToPay,
      phone:            load.PointOfContactPhone ?? null,
      age_hours:        parseInt(load.Age ?? 0, 10),
      status:           'available',
      posted_date:      new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Failed to normalize Truckstop load:', err);
    return null;
  }
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

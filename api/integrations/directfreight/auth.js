/**
 * POST /api/integrations/directfreight/auth
 *
 * Receives username + password from the client, authenticates against the
 * Direct Freight API, then stores the token in user_integrations.
 * The raw password is never persisted.
 *
 * TODO: Confirm the exact base URL and auth request/response shape with
 *       Direct Freight API documentation before going to production.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// TODO: Confirm actual Direct Freight API base URL
const DF_BASE_URL = process.env.DIRECTFREIGHT_API_URL || 'https://api.directfreight.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify the app user's JWT
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

  // ── POST: connect / re-authenticate ─────────────────────────────────────────
  if (req.method === 'POST') {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      // Call Direct Freight authentication endpoint
      // TODO: Verify exact request body field names with DF API docs
      const dfRes = await fetch(`${DF_BASE_URL}/authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!dfRes.ok) {
        const errBody = await dfRes.text();
        console.error('Direct Freight auth failed:', dfRes.status, errBody);
        if (dfRes.status === 401 || dfRes.status === 403) {
          return res.status(400).json({ error: 'Invalid Direct Freight username or password' });
        }
        return res.status(502).json({ error: 'Direct Freight authentication failed' });
      }

      // TODO: Verify exact token field names in the DF auth response
      const dfData = await dfRes.json();
      const token = dfData.token || dfData.access_token || dfData.authToken;
      const expiresAt = dfData.expires_at || dfData.expires
        ? new Date(dfData.expires_at || dfData.expires).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default 24h

      if (!token) {
        console.error('Direct Freight auth response missing token:', dfData);
        return res.status(502).json({ error: 'Unexpected response from Direct Freight' });
      }

      // Store token in user_integrations (password is never stored)
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

  // ── DELETE: disconnect ───────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({
          is_connected: false,
          access_token: null,
          token_expires_at: null
        })
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

  return res.status(405).json({ error: 'Method not allowed' });
}

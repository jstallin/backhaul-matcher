/**
 * /api/integrations/truckstop
 *
 * Handles Truckstop.com API token storage with org-level sharing.
 *
 * Users with a non-generic business email domain (e.g. aimntls.com) share
 * one token across their entire organization — stored in org_integrations.
 * Users with generic free email domains require their own token — stored in
 * user_integrations.
 *
 * Routes:
 *   GET    — check connection status (org token first, then user token)
 *   POST   — save API token
 *   DELETE — disconnect
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'pm.me',
  'ymail.com', 'msn.com', 'googlemail.com'
]);

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || '';
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

  const userDomain = getEmailDomain(user.email);
  const orgLevel = isOrgDomain(userDomain);

  // ── GET status ─────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      // For org domains, check org_integrations first
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

      // Fall back to user-level token
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

  // ── POST connect ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { api_token } = req.body || {};

    if (!api_token || !api_token.trim()) {
      return res.status(400).json({ error: 'API token is required' });
    }

    const token = api_token.trim();

    try {
      if (orgLevel) {
        // Store as org-level token
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
        // Store as user-level token
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
        return res.status(200).json({
          success: true,
          message: 'Truckstop connected successfully',
          is_org_token: false
        });
      }
    } catch (err) {
      console.error('Truckstop POST error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
    }
  }

  // ── DELETE disconnect ──────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      if (orgLevel) {
        // Only the person who connected it (or any org member) can disconnect
        const { error } = await supabase
          .from('org_integrations')
          .delete()
          .eq('email_domain', userDomain)
          .eq('provider', 'truckstop');

        if (error && error.code !== 'PGRST116') {
          return res.status(500).json({ error: 'Failed to disconnect' });
        }
      }

      // Also clear any user-level token
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

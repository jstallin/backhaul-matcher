/**
 * /api/integrations/dat
 *
 * Single handler for all DAT integration endpoints.
 * Routed by HTTP method:
 *
 *   GET    — check connection status
 *   POST   — link DAT account (email)
 *   DELETE — disconnect
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

  // ── GET status ────────────────────────────────────────────────────────────
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

  // ── POST connect ──────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'DAT email address is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    console.log(`🔗 DAT Connect: Linking ${email} for user ${user.id}`);

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
        return res.status(500).json({ error: 'Failed to link DAT account. Please try again.', code: 'DB_ERROR' });
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

  // ── DELETE disconnect ─────────────────────────────────────────────────────
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

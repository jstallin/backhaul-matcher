/**
 * GET /api/integrations/directfreight/status
 * Returns the current Direct Freight connection status for the user.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

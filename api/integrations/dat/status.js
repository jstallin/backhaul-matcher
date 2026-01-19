import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify user is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - missing auth token' });
  }

  const userToken = authHeader.replace('Bearer ', '');

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

  // GET - Check connection status
  if (req.method === 'GET') {
    try {
      const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'dat')
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine
        console.error('Error fetching integration status:', error);
        return res.status(500).json({ error: 'Failed to check connection status' });
      }

      if (!integration) {
        return res.status(200).json({
          connected: false,
          provider: 'dat'
        });
      }

      // Check if token is expired
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
    } catch (error) {
      console.error('Error checking DAT status:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  // DELETE - Disconnect the integration
  if (req.method === 'DELETE') {
    try {
      console.log(`🔌 Disconnecting DAT integration for user ${user.id}`);

      // Option 1: Soft delete - just mark as disconnected and clear tokens
      const { error: updateError } = await supabase
        .from('user_integrations')
        .update({
          is_connected: false,
          access_token: null,
          refresh_token: null,
          token_expires_at: null
        })
        .eq('user_id', user.id)
        .eq('provider', 'dat');

      if (updateError) {
        // If no row exists, that's fine - they're already disconnected
        if (updateError.code !== 'PGRST116') {
          console.error('Error disconnecting:', updateError);
          return res.status(500).json({ error: 'Failed to disconnect' });
        }
      }

      console.log(`✅ DAT integration disconnected for user ${user.id}`);

      return res.status(200).json({
        success: true,
        message: 'DAT account disconnected successfully'
      });
    } catch (error) {
      console.error('Error disconnecting DAT:', error);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

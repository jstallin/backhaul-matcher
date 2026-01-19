import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify user is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - missing auth token' });
  }

  const userToken = authHeader.replace('Bearer ', '');

  // Create Supabase client to verify user
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

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  console.log(`🔗 DAT Connect: Attempting authentication for user ${user.id} with DAT account ${username}`);

  try {
    // DAT API Authentication
    // DAT uses a two-level auth system:
    // 1. Service account authentication (app-level)
    // 2. User-level authentication

    const datApiUrl = process.env.DAT_API_URL || 'https://freight.api.dat.com';
    const datClientId = process.env.DAT_CLIENT_ID;
    const datClientSecret = process.env.DAT_CLIENT_SECRET;

    if (!datClientId || !datClientSecret) {
      console.error('DAT API credentials not configured');
      return res.status(500).json({
        error: 'DAT integration not configured. Please contact support.',
        code: 'DAT_NOT_CONFIGURED'
      });
    }

    // Step 1: Authenticate with DAT API
    // Using OAuth2 password grant flow
    const authResponse = await fetch(`${datApiUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${datClientId}:${datClientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: username,
        password: password,
        scope: 'openid profile' // Adjust based on DAT's actual scopes
      }).toString()
    });

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      console.error('DAT authentication failed:', authData);

      // Handle specific error cases
      if (authResponse.status === 401 || authData.error === 'invalid_grant') {
        return res.status(401).json({
          error: 'Invalid DAT credentials. Please check your username and password.',
          code: 'INVALID_CREDENTIALS'
        });
      }

      return res.status(400).json({
        error: authData.error_description || 'Failed to authenticate with DAT',
        code: 'AUTH_FAILED'
      });
    }

    const { access_token, refresh_token, expires_in, token_type } = authData;

    if (!access_token) {
      console.error('No access token in DAT response');
      return res.status(500).json({
        error: 'Authentication succeeded but no access token received',
        code: 'NO_TOKEN'
      });
    }

    // Calculate token expiration
    const expiresAt = expires_in
      ? new Date(Date.now() + (expires_in * 1000)).toISOString()
      : null;

    console.log(`✅ DAT authentication successful for ${username}`);

    // Step 2: Store the integration in our database
    const integrationData = {
      user_id: user.id,
      provider: 'dat',
      account_email: username,
      access_token: access_token,
      refresh_token: refresh_token || null,
      token_expires_at: expiresAt,
      is_connected: true,
      connected_at: new Date().toISOString(),
      metadata: {
        token_type: token_type || 'Bearer',
        last_verified_at: new Date().toISOString()
      }
    };

    // Upsert - update if exists, insert if not
    const { data: integration, error: dbError } = await supabase
      .from('user_integrations')
      .upsert(integrationData, {
        onConflict: 'user_id,provider',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to save integration:', dbError);
      // Still return success since auth worked, just warn about storage
      return res.status(200).json({
        success: true,
        message: 'Connected to DAT successfully',
        warning: 'Connection saved with issues - may need to reconnect later',
        account_email: username
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Successfully connected to DAT',
      account_email: username,
      connected_at: integration.connected_at,
      expires_at: expiresAt
    });

  } catch (error) {
    console.error('DAT connection error:', error);

    // Check if it's a network error
    if (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Unable to reach DAT servers. Please try again later.',
        code: 'DAT_UNAVAILABLE'
      });
    }

    return res.status(500).json({
      error: 'An unexpected error occurred while connecting to DAT',
      code: 'INTERNAL_ERROR'
    });
  }
}

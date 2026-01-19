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

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'DAT email address is required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  console.log(`🔗 DAT Connect: Linking DAT account ${email} for user ${user.id}`);

  try {
    // Store the DAT email link in our database
    // When the service account is configured, API calls will use:
    // - Service account credentials (from env vars) for organization auth
    // - This email for user-level identification
    const integrationData = {
      user_id: user.id,
      provider: 'dat',
      account_email: email.toLowerCase().trim(),
      is_connected: true,
      connected_at: new Date().toISOString(),
      metadata: {
        auth_type: 'service_account', // Using service account model
        linked_at: new Date().toISOString()
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
      return res.status(500).json({
        error: 'Failed to link DAT account. Please try again.',
        code: 'DB_ERROR'
      });
    }

    console.log(`✅ DAT account linked successfully: ${email}`);

    return res.status(200).json({
      success: true,
      message: 'DAT account linked successfully',
      account_email: integration.account_email,
      connected_at: integration.connected_at
    });

  } catch (error) {
    console.error('DAT connection error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR'
    });
  }
}

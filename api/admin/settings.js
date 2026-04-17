/**
 * /api/admin/settings
 *
 * GET  — return all admin settings (admin-only)
 * POST — upsert a setting { key, value } (admin-only)
 *
 * Uses service role key so it bypasses RLS, but validates admin
 * membership manually before responding.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify caller is a real, authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Verify caller is in admin_users
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('key, value, updated_at')
      .order('key');

    if (error) return res.status(500).json({ error: 'Failed to load settings' });
    return res.status(200).json({ settings: data || [] });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save setting' });
    console.log(`[admin] setting updated: ${key} =`, JSON.stringify(value), `by ${user.email}`);
    return res.status(200).json({ setting: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

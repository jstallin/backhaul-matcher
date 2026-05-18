/**
 * GET /api/reports/trimble-actuals?month=YYYY-MM
 *
 * Returns all completed (hauled) loads for the given month.
 * Defaults to the current month if no month param is provided.
 * App admin only.
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
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  // Parse month param (YYYY-MM) or default to current month
  const monthParam = req.query.month;
  let start, end;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    start = new Date(`${monthParam}-01T00:00:00.000Z`);
  } else {
    const now = new Date();
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const { data: loads, error } = await supabase
    .from('backhaul_requests')
    .select('completed_at, hauled_load_id, hauled_load_source')
    .eq('status', 'completed')
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString())
    .order('completed_at', { ascending: true });

  if (error) {
    console.error('[trimble-actuals] query error:', error.message);
    return res.status(500).json({ error: 'Failed to query loads' });
  }

  return res.status(200).json({
    month: start.toISOString().slice(0, 7),
    count: loads.length,
    loads: loads.map(r => ({
      completed_at: r.completed_at,
      load_id: r.hauled_load_id || null,
      source: r.hauled_load_source || null,
    })),
  });
}

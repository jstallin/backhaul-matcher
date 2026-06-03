import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Disable body parsing so we can read raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const PACKAGES = {
  starter: { credits: 10, priceEnv: 'STRIPE_PRICE_STARTER', label: 'Starter – 10 Credits' },
  pro:     { credits: 30, priceEnv: 'STRIPE_PRICE_PRO',     label: 'Pro – 30 Credits' },
  fleet:   { credits: 100, priceEnv: 'STRIPE_PRICE_FLEET',  label: 'Fleet – 100 Credits' },
};

// Verify JWT and return userId
async function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// True if the user is an app admin (admin_users table)
async function isAppAdmin(userId) {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

// Returns true if the user belongs to a pilot org whose date window is active
async function isInPilotOrg(userId) {
  const { data } = await supabaseAdmin
    .from('org_memberships')
    .select('orgs(is_pilot, pilot_start_date, pilot_end_date)')
    .eq('user_id', userId)
    .maybeSingle();

  const org = data?.orgs;
  if (!org?.is_pilot) return false;

  const today = new Date().toISOString().split('T')[0];
  if (org.pilot_start_date && org.pilot_start_date > today) return false;
  if (org.pilot_end_date && org.pilot_end_date < today) return false;

  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });
  const stripe = new Stripe(stripeKey);

  // ── GET balance ─────────────────────────────────────────────────────────────
  if (action === 'balance') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (await isInPilotOrg(userId)) {
      return res.status(200).json({ balance: 999, is_pilot: true });
    }

    const { data, error } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Failed to fetch balance' });
    }
    return res.status(200).json({ balance: data?.balance ?? 0 });
  }

  // ── GET revenue (app admin only) ─────────────────────────────────────────────
  // Trailing 6 months of net-of-fee revenue from Stripe balance transactions,
  // grouped by calendar month. Powers the admin net-revenue / P&L trend view.
  if (action === 'revenue') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!(await isAppAdmin(userId))) return res.status(403).json({ error: 'App admin access required' });

    const monthsBack = 6;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));
    const startUnix = Math.floor(start.getTime() / 1000);

    // Sales-related balance-transaction types (exclude payouts/transfers/stripe billing fees).
    const REVENUE_TYPES = new Set(['charge', 'payment', 'payment_refund', 'refund', 'adjustment']);

    const buckets = {};
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets[key] = { month: key, grossCents: 0, feeCents: 0, netCents: 0, count: 0 };
    }

    try {
      let hasMore = true;
      let startingAfter;
      let pages = 0;
      while (hasMore && pages < 20) {
        const params = { limit: 100, created: { gte: startUnix } };
        if (startingAfter) params.starting_after = startingAfter;
        const page = await stripe.balanceTransactions.list(params);
        for (const tx of page.data) {
          if (!REVENUE_TYPES.has(tx.type)) continue;
          const d = new Date(tx.created * 1000);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!buckets[key]) continue;
          buckets[key].grossCents += tx.amount;
          buckets[key].feeCents += tx.fee;
          buckets[key].netCents += tx.net;
          buckets[key].count += 1;
        }
        hasMore = page.has_more;
        startingAfter = page.data.length ? page.data[page.data.length - 1].id : undefined;
        pages++;
      }
    } catch (err) {
      console.error('[stripe revenue] balance transaction list failed:', err.message);
      return res.status(500).json({ error: 'Failed to load Stripe revenue' });
    }

    const months = Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month));
    return res.status(200).json({ months, currency: 'usd' });
  }

  // ── POST checkout ────────────────────────────────────────────────────────────
  if (action === 'checkout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rawBody = await readRawBody(req);
    const { packageId } = JSON.parse(rawBody || '{}');
    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    const priceId = process.env[pkg.priceEnv];
    if (!priceId) return res.status(500).json({ error: `Price not configured for ${packageId}` });

    const origin = req.headers.origin || 'https://haulmonitor.cloud';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app?credits=success&package=${packageId}`,
      cancel_url: `${origin}/app?credits=cancel`,
      metadata: { user_id: userId, package_id: packageId, credits: pkg.credits },
    });

    return res.status(200).json({ url: session.url });
  }

  // ── POST deduct ──────────────────────────────────────────────────────────────
  if (action === 'deduct') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (await isInPilotOrg(userId)) {
      return res.status(200).json({ success: true, balance: 999, is_pilot: true });
    }

    const rawBody = await readRawBody(req);
    const { description = 'Backhaul search', amount = 1 } = JSON.parse(rawBody || '{}');
    const p_amount = Math.max(1, Math.floor(amount));

    const { data: ok, error } = await supabaseAdmin.rpc('deduct_credit', {
      p_user_id: userId,
      p_amount,
      p_description: description,
    });

    if (error) return res.status(500).json({ success: false, error: 'Deduction failed' });
    if (!ok) return res.status(402).json({ success: false, error: 'Insufficient credits' });

    // Return updated balance
    const { data: row } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    return res.status(200).json({ success: true, balance: row?.balance ?? 0 });
  }

  // ── POST webhook ─────────────────────────────────────────────────────────────
  if (action === 'webhook') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: 'Webhook secret not configured' });

    const rawBody = await readRawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const credits = parseInt(session.metadata?.credits || '0', 10);
      const packageId = session.metadata?.package_id;

      if (!userId || !credits) {
        console.error('Webhook missing metadata:', session.metadata);
        return res.status(200).json({ received: true });
      }

      const { error } = await supabaseAdmin.rpc('add_credits', {
        p_user_id: userId,
        p_amount: credits,
        p_description: `Purchase: ${PACKAGES[packageId]?.label || packageId}`,
        p_stripe_session_id: session.id,
      });

      if (error) {
        console.error('Failed to add credits:', error);
        return res.status(500).json({ error: 'Failed to credit account' });
      }

      console.log(`Credited ${credits} to user ${userId}`);
    }

    return res.status(200).json({ received: true });
  }

  return res.status(400).json({ error: 'Missing ?action=' });
}

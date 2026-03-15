import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Disable body parsing so we can read raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
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

    const rawBody = await readRawBody(req);
    const { description = 'Backhaul search' } = JSON.parse(rawBody || '{}');

    const { data: ok, error } = await supabaseAdmin.rpc('deduct_credit', {
      p_user_id: userId,
      p_amount: 1,
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

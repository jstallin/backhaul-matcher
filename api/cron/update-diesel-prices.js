import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for server-side
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// EIA API v2 endpoint for weekly retail diesel prices
const EIA_API_BASE = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/';

// Map our doe_padd_region values to EIA duoarea facet codes
const REGION_TO_EIA_CODE = {
  national: 'NUS',
  east_coast: 'R10',
  midwest: 'R20',
  gulf_coast: 'R30',
  rocky_mountain: 'R40',
  west_coast: 'R50'
};

const EIA_CODE_TO_REGION = Object.fromEntries(
  Object.entries(REGION_TO_EIA_CODE).map(([k, v]) => [v, k])
);

async function fetchDieselPrices(apiKey) {
  // Fetch latest weekly diesel prices for all PADD regions in one call
  const duoareaCodes = Object.values(REGION_TO_EIA_CODE);
  const params = new URLSearchParams({
    api_key: apiKey,
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[product][]': 'EPD2DXL0', // No. 2 Diesel retail prices
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '6' // One per region (6 regions), most recent week
  });

  // Add each duoarea as a separate facet
  for (const code of duoareaCodes) {
    params.append('facets[duoarea][]', code);
  }

  const url = `${EIA_API_BASE}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EIA API returned ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (!data.response || !data.response.data) {
    throw new Error('Unexpected EIA API response structure');
  }

  // Parse into a map of region -> { price, period }
  const prices = {};
  for (const row of data.response.data) {
    const region = EIA_CODE_TO_REGION[row.duoarea];
    if (region && row.value != null) {
      // Only keep the most recent entry per region
      if (!prices[region] || row.period > prices[region].period) {
        prices[region] = {
          price: parseFloat(row.value),
          period: row.period
        };
      }
    }
  }

  return prices;
}

async function updateFleetProfiles(prices) {
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const [region, { price, period }] of Object.entries(prices)) {
    const { data, error } = await supabase
      .from('fleet_profiles')
      .update({
        doe_padd_rate: price,
        doe_padd_updated_at: now
      })
      .eq('doe_padd_region', region)
      .select('id');

    if (error) {
      console.error(`Error updating fleet profiles for region ${region}:`, error.message);
    } else if (data) {
      updatedCount += data.length;
      console.log(`Updated ${data.length} fleet profile(s) for ${region}: $${price}/gal (week of ${period})`);
    }
  }

  return updatedCount;
}

// ── AI preference profile summarization ──────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MIN_SIGNAL_FEEDBACK = 3;   // min feedback entries to generate a profile
const MIN_SIGNAL_HAULS    = 5;   // OR min completed hauls
const PROFILE_TTL_DAYS    = 7;   // re-generate at most once per week

async function summarizeOrgPreferences() {
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY not set — skipping preference summarization');
    return { skipped: true };
  }

  // Find fleet_profiles that have enough signal and are due for a refresh
  const staleThreshold = new Date(Date.now() - PROFILE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: profilesErr } = await supabase
    .from('fleet_profiles')
    .select('id, fleet_id, ai_preference_profile, ai_profile_updated_at')
    .or(`ai_profile_updated_at.is.null,ai_profile_updated_at.lt.${staleThreshold}`);

  if (profilesErr) {
    console.error('summarizeOrgPreferences: profile fetch error:', profilesErr.message);
    return { error: profilesErr.message };
  }

  console.log(`🧠 Preference summarization: ${profiles?.length || 0} profiles eligible`);

  let updated = 0;
  let skipped = 0;

  for (const profile of (profiles || [])) {
    const fleetId = profile.fleet_id;

    // Fetch signal in parallel
    const [feedbackRes, hauledRes] = await Promise.all([
      supabase
        .from('org_ai_feedback')
        .select('rating, comment, load_data, created_at')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('backhaul_requests')
        .select('datum_point, equipment_type, out_of_route_miles, net_revenue, revenue_amount, completed_at')
        .eq('fleet_id', fleetId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20),
    ]);

    const feedback = feedbackRes.data || [];
    const hauls    = hauledRes.data  || [];

    // Skip if not enough signal
    if (feedback.length < MIN_SIGNAL_FEEDBACK && hauls.length < MIN_SIGNAL_HAULS) {
      skipped++;
      continue;
    }

    // Build summarization prompt
    const haulLines = hauls.map(h => {
      const net   = h.net_revenue    != null ? ` | net $${Number(h.net_revenue).toFixed(0)}`    : '';
      const gross = h.revenue_amount != null ? ` | gross $${Number(h.revenue_amount).toFixed(0)}` : '';
      const oor   = h.out_of_route_miles != null ? ` | ${h.out_of_route_miles} OOR mi`          : '';
      const equip = h.equipment_type ? ` | ${h.equipment_type}` : '';
      const when  = h.completed_at   ? new Date(h.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `  - ${h.datum_point || 'unknown'}${equip}${oor}${gross}${net}${when ? ` (${when})` : ''}`;
    }).join('\n');

    const feedbackLines = feedback.map(f => {
      const ld      = f.load_data || {};
      const route   = (ld.origin && ld.destination) ? `${ld.origin} → ${ld.destination}` : null;
      const rpm     = ld.revenue_per_mile  != null ? ` | $${Number(ld.revenue_per_mile).toFixed(2)}/mi`  : '';
      const oor     = ld.additional_miles  != null ? ` | ${ld.additional_miles} OOR mi` : '';
      const comment = f.comment ? ` — "${f.comment}"` : '';
      const verdict = f.rating === 'up' ? '👍 agreed' : '👎 disagreed';
      return `  - ${verdict}${route ? `: ${route}` : ''}${rpm}${oor}${comment}`;
    }).join('\n');

    const summarizationPrompt = `You are building a preference profile for a freight dispatch fleet based on their haul history and AI feedback. Write 2–3 sentences that capture this fleet's patterns and preferences in a way that will help an AI advisor give better load recommendations.

Focus on what you can actually observe: rate thresholds, OOR mile tolerance, equipment, lanes or regions, and any explicit preferences they've called out in feedback comments.

Be specific and data-driven. If a pattern is unclear, don't speculate. Write in second person ("This fleet...").

COMPLETED HAULS:
${haulLines || '  (none)'}

AI FEEDBACK:
${feedbackLines || '  (none)'}

Write the preference profile now (2–3 sentences, no headers, no bullet points):`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [{ role: 'user', content: summarizationPrompt }],
        }),
      });

      if (!response.ok) {
        console.error(`summarizeOrgPreferences: Claude API ${response.status} for fleet ${fleetId}`);
        continue;
      }

      const result = await response.json();
      const profileText = result.content?.find(b => b.type === 'text')?.text?.trim();

      if (!profileText) continue;

      const { error: updateErr } = await supabase
        .from('fleet_profiles')
        .update({
          ai_preference_profile:  profileText,
          ai_profile_updated_at:  new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updateErr) {
        console.error(`summarizeOrgPreferences: update error for fleet ${fleetId}:`, updateErr.message);
      } else {
        console.log(`  ✅ Profile updated for fleet ${fleetId}: "${profileText.slice(0, 80)}..."`);
        updated++;
      }
    } catch (err) {
      console.error(`summarizeOrgPreferences: unexpected error for fleet ${fleetId}:`, err.message);
    }
  }

  return { updated, skipped, eligible: profiles?.length || 0 };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized access
  // Accepts: Authorization header, ?secret= query param, or skips if CRON_SECRET not set
  const authHeader = req.headers['authorization'];
  const querySecret = req.query?.secret;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const headerMatch = authHeader === `Bearer ${cronSecret}`;
    const queryMatch = querySecret === cronSecret;
    if (!headerMatch && !queryMatch) {
      console.warn('Unauthorized cron request attempted');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.error('EIA_API_KEY environment variable not set');
    return res.status(500).json({ error: 'EIA_API_KEY not configured' });
  }

  try {
    console.log('Fetching diesel prices from EIA API...');
    const prices = await fetchDieselPrices(apiKey);

    const regionCount = Object.keys(prices).length;
    if (regionCount === 0) {
      console.warn('No diesel prices returned from EIA API');
      return res.status(200).json({
        success: true,
        message: 'No prices returned from EIA',
        regionsFound: 0,
        profilesUpdated: 0
      });
    }

    console.log(`Fetched prices for ${regionCount} regions:`,
      Object.entries(prices).map(([r, p]) => `${r}: $${p.price}`).join(', ')
    );

    const updatedCount = await updateFleetProfiles(prices);

    // Run AI preference summarization as a secondary daily task
    console.log('🧠 Running AI preference profile summarization...');
    const aiResult = await summarizeOrgPreferences();

    return res.status(200).json({
      success: true,
      regionsFound: regionCount,
      profilesUpdated: updatedCount,
      prices: Object.fromEntries(
        Object.entries(prices).map(([r, p]) => [r, `$${p.price}/gal (${p.period})`])
      ),
      aiPreferences: aiResult,
    });
  } catch (err) {
    console.error('Diesel price update failed:', err.message);
    return res.status(500).json({
      error: 'Failed to update diesel prices',
      details: err.message
    });
  }
}

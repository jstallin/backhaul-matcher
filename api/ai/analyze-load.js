/**
 * POST /api/ai/analyze-load
 *
 * Two modes, differentiated by request body:
 *   { match, fleet, request }          → single load analysis (one-shot, no auth required)
 *   { messages, context, contextData } → Co-driver chat (multi-turn, auth required for tool use)
 */

import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Knowledge Base ────────────────────────────────────────────────────────────

const KNOWLEDGE_BASE = `
HAUL MONITOR KNOWLEDGE BASE

## What is Haul Monitor?
Haul Monitor is a backhaul matching platform for trucking fleets. When a truck completes a primary delivery and needs to return home, Haul Monitor finds available loads along the route home so the truck earns revenue instead of deadheading (running empty).

## Core Concepts
- **Backhaul**: A load that gets the truck home (or closer to home) after a primary delivery. The baseline alternative is always deadheading — running empty with zero revenue.
- **Datum Point**: City, State where the truck currently is. This is the search origin.
- **Out-of-Route (OOR) Miles**: Extra miles added vs. going straight home. Lower = better. 0 OOR = perfectly on the way home.
- **Revenue Per Mile (RPM)**: Gross revenue ÷ total backhaul route miles. Typical dry van RPMs run $1.80–$2.50/mi depending on lane.
- **Relay Mode**: For fleets whose drivers always return to a home terminal between loads. OOR is calculated as the full loop: home → pickup → delivery → home (vs. standard: datum → pickup → delivery → home).

## Fleet Setup
1. Menu → Fleets → select or create a fleet
2. Set fleet name, home city/state, trailer type
3. Add trucks (unit number, year, make/model) and drivers (name, phone, CDL)
4. In Fleet Setup (gear icon), configure rate settings: cost per mile, target RPM, fuel surcharge rate

Rate config is optional but unlocks the full financial breakdown on results (net revenue, carrier revenue, mileage expense).

## Starting a Backhaul Request
1. Menu → Start Backhaul Request
2. Select fleet, enter datum point (City, State), equipment type, pickup date
3. Submit — matching runs automatically, results sorted best first

## Understanding Results
Each result shows:
- Route (pickup → delivery), load miles, equipment type
- OOR miles (extra miles vs. going home direct)
- Miles to pickup from datum, miles from delivery to home
- RPM and gross revenue; full financial breakdown if rate config is set
- "Ask AI" button for a TAKE IT / PASS / NEGOTIATE recommendation

## Financial Breakdown (requires rate config)
Gross revenue → subtract fuel surcharge (OOR mi × FSC rate) → subtract mileage expense (OOR mi × cost/mi) = net to carrier. Customer net credit is revenue minus mileage expense (what the load is worth net of route cost).

## Estimate Requests
Menu → Create Estimate Request. Enter a lane (origin/destination) to get an estimated RPM and load outlook before dispatching a truck. Useful for trip budgeting and lane comparison.

## Fleet Reports
Menu → Fleet Reports: revenue by fleet over time, OOR summary, load count, net revenue trends.

## Completing a Load ("Haul This Load")
Click "Haul This Load" on any result to record the load as completed. This captures revenue, net revenue, OOR miles, and completion date. Completed hauls feed into Fleet Reports and improve AI recommendations over time.

## AI Features
- **Ask AI**: Per-load recommendation (TAKE IT / PASS / NEGOTIATE) with reasoning. Calibrates to fleet history and rate preferences.
- **Co-driver (this chat)**: Conversational assistant available on Dashboard, Results, and Open Requests. Handles questions, helps create records, and can walk through any feature.
- **Feedback (thumbs up/down)**: Rates Ask AI responses. Signals train the AI preference profile for your fleet.

## Common Issues
- **No results showing**: Check that the fleet has a home location set, datum is in "City, State" format, and equipment type is correct. If loads are sparse on a lane, try an adjacent datum point.
- **Distances look wrong**: Distances use PC*MILER (Trimble), the trucking industry standard. If a specific distance is clearly off, contact support with the route details.
- **Financial breakdown not showing**: Rate config must be set in Fleet Setup (gear icon on the fleet). Set cost per mile and FSC rate at minimum.
- **Relay mode**: Toggle it on the request form. Use when drivers always return to a home base between loads.
- **Adding org users**: Settings → Team/Organization → invite by email.
- **Credits and billing**: Managed in Settings → Billing. Contact support@haulmonitor.cloud for billing questions or disputes.
`.trim();

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_fleets',
    description: 'Get the user\'s existing fleets. Call this to find fleet IDs before creating requests, drivers, or trucks.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'create_fleet',
    description: 'Create a new fleet for the user. Only call this after confirming details with the user.',
    input_schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:          { type: 'string', description: 'Fleet name' },
        trailer_type:  { type: 'string', description: 'e.g. Dry Van, Flatbed, Refrigerated, Step Deck, Lowboy' },
        home_city:     { type: 'string' },
        home_state:    { type: 'string', description: '2-letter abbreviation' },
        home_address:  { type: 'string', description: 'Full home address if provided' }
      }
    }
  },
  {
    name: 'create_backhaul_request',
    description: 'Create a new backhaul request. Only call after confirming details with the user.',
    input_schema: {
      type: 'object',
      required: ['fleet_id', 'request_name', 'datum_point'],
      properties: {
        fleet_id:       { type: 'string', description: 'Fleet ID (use list_fleets to find it)' },
        request_name:   { type: 'string', description: 'Descriptive name for the request' },
        datum_point:    { type: 'string', description: 'City, State where the truck currently is, e.g. Memphis, TN' },
        equipment_type: { type: 'string', description: 'e.g. Dry Van, Flatbed' },
        pickup_date:    { type: 'string', description: 'YYYY-MM-DD format' }
      }
    }
  },
  {
    name: 'create_driver',
    description: 'Add a driver to a fleet. Only call after confirming details with the user.',
    input_schema: {
      type: 'object',
      required: ['fleet_id', 'first_name', 'last_name'],
      properties: {
        fleet_id:        { type: 'string' },
        first_name:      { type: 'string' },
        last_name:       { type: 'string' },
        phone:           { type: 'string' },
        email:           { type: 'string' },
        license_number:  { type: 'string' }
      }
    }
  },
  {
    name: 'create_truck',
    description: 'Add a truck to a fleet. Only call after confirming details with the user.',
    input_schema: {
      type: 'object',
      required: ['fleet_id'],
      properties: {
        fleet_id:     { type: 'string' },
        truck_number: { type: 'string', description: 'Unit or truck number' },
        year:         { type: 'integer' },
        make:         { type: 'string', description: 'e.g. Freightliner, Kenworth' },
        model:        { type: 'string', description: 'e.g. Cascadia, T680' },
        vin:          { type: 'string' }
      }
    }
  }
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(name, input, supabase, userId) {
  try {
    switch (name) {
      case 'list_fleets': {
        const { data, error } = await supabase
          .from('fleets')
          .select('id, name, trailer_type, home_city, home_state')
          .eq('user_id', userId);
        if (error) return { error: error.message };
        return { fleets: data || [] };
      }

      case 'create_fleet': {
        const { data: fleet, error } = await supabase
          .from('fleets')
          .insert({ ...input, user_id: userId })
          .select()
          .single();
        if (error) return { error: error.message };
        // Auto-create default fleet profile
        await supabase.from('fleet_profiles').insert({ fleet_id: fleet.id, user_id: userId });
        return { success: true, fleet_id: fleet.id, fleet_name: fleet.name };
      }

      case 'create_backhaul_request': {
        const { data: req, error } = await supabase
          .from('backhaul_requests')
          .insert({ ...input, user_id: userId, status: 'active' })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, request_id: req.id, request_name: req.request_name };
      }

      case 'create_driver': {
        const { data: driver, error } = await supabase
          .from('drivers')
          .insert({ ...input, user_id: userId })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, driver_id: driver.id, name: `${driver.first_name} ${driver.last_name}` };
      }

      case 'create_truck': {
        const { data: truck, error } = await supabase
          .from('trucks')
          .insert({ ...input, user_id: userId })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, truck_id: truck.id, truck_number: truck.truck_number };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── Org history fetcher ───────────────────────────────────────────────────────

async function fetchOrgHistory(fleetId) {
  if (!fleetId || !supabaseUrl || !supabaseServiceKey) return null;
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for a stored preference profile first (Phase 3)
    const { data: profileRow } = await supabase
      .from('fleet_profiles')
      .select('ai_preference_profile, ai_profile_updated_at')
      .eq('fleet_id', fleetId)
      .maybeSingle();

    const storedProfile = profileRow?.ai_preference_profile || null;
    const profileUpdatedAt = profileRow?.ai_profile_updated_at || null;

    if (storedProfile) {
      // Profile exists — fetch only feedback since the last summarization to catch new signals
      const recentFeedbackRes = await supabase
        .from('org_ai_feedback')
        .select('rating, comment, load_data, created_at')
        .eq('fleet_id', fleetId)
        .gt('created_at', profileUpdatedAt)
        .order('created_at', { ascending: false })
        .limit(10);

      const recent = recentFeedbackRes.data || [];
      const lines = [`FLEET PREFERENCE PROFILE:\n${storedProfile}`];

      if (recent.length) {
        lines.push('');
        lines.push('RECENT FEEDBACK (since last profile update):');
        recent.forEach(f => {
          const ld = f.load_data || {};
          const route = (ld.origin && ld.destination) ? `${ld.origin} → ${ld.destination}` : null;
          const rpm = ld.revenue_per_mile != null ? ` | $${Number(ld.revenue_per_mile).toFixed(2)}/mi` : '';
          const oor = ld.additional_miles != null ? ` | ${ld.additional_miles} OOR mi` : '';
          const comment = f.comment ? ` — "${f.comment}"` : '';
          const verdict = f.rating === 'up' ? '👍 agreed' : '👎 disagreed';
          lines.push(`  - ${verdict}${route ? `: ${route}` : ''}${rpm}${oor}${comment}`);
        });
      }

      return lines.join('\n');
    }

    // No profile yet — fall back to raw rows (Phase 2 behavior)
    const [hauledRes, feedbackRes] = await Promise.all([
      supabase
        .from('backhaul_requests')
        .select('datum_point, equipment_type, out_of_route_miles, net_revenue, revenue_amount, completed_at')
        .eq('fleet_id', fleetId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(15),
      supabase
        .from('org_ai_feedback')
        .select('rating, comment, load_data, created_at')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

    const hauls = hauledRes.data || [];
    const feedback = feedbackRes.data || [];
    if (!hauls.length && !feedback.length) return null;

    const lines = [];

    if (hauls.length) {
      lines.push('COMPLETED HAULS (most recent first):');
      hauls.forEach(h => {
        const net = h.net_revenue != null ? ` | net $${Number(h.net_revenue).toFixed(0)}` : '';
        const rev = h.revenue_amount != null ? ` | gross $${Number(h.revenue_amount).toFixed(0)}` : '';
        const oor = h.out_of_route_miles != null ? ` | ${h.out_of_route_miles} OOR mi` : '';
        const equip = h.equipment_type ? ` | ${h.equipment_type}` : '';
        const when = h.completed_at ? new Date(h.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        lines.push(`  - ${h.datum_point || 'unknown datum'}${equip}${oor}${rev}${net}${when ? ` (${when})` : ''}`);
      });
    }

    if (feedback.length) {
      lines.push('');
      lines.push('AI RECOMMENDATION FEEDBACK (most recent first):');
      feedback.forEach(f => {
        const ld = f.load_data || {};
        const route = (ld.origin && ld.destination) ? `${ld.origin} → ${ld.destination}` : null;
        const rpm = ld.revenue_per_mile != null ? ` | $${Number(ld.revenue_per_mile).toFixed(2)}/mi` : '';
        const oor = ld.additional_miles != null ? ` | ${ld.additional_miles} OOR mi` : '';
        const comment = f.comment ? ` — "${f.comment}"` : '';
        const verdict = f.rating === 'up' ? '👍 agreed' : '👎 disagreed';
        lines.push(`  - ${verdict}${route ? `: ${route}` : ''}${rpm}${oor}${comment}`);
      });
    }

    return lines.join('\n');
  } catch (err) {
    console.error('fetchOrgHistory error:', err.message);
    return null;
  }
}

// ── Claude API helper ─────────────────────────────────────────────────────────

async function callClaude({ messages, system, tools, maxTokens = 500 }) {
  const body = { model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages };
  if (tools?.length) body.tools = tools;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }
  return response.json();
}

// ── Tool use loop ─────────────────────────────────────────────────────────────

async function runWithTools(messages, systemPrompt, supabase, userId, maxIter = 4) {
  let msgs = [...messages];

  for (let i = 0; i < maxIter; i++) {
    const result = await callClaude({ messages: msgs, system: systemPrompt, tools: TOOLS });

    if (result.stop_reason !== 'tool_use') {
      const text = result.content?.find(b => b.type === 'text')?.text || '';
      return text;
    }

    // Add Claude's full response (may include text + tool_use blocks)
    msgs.push({ role: 'assistant', content: result.content });

    // Execute all tool calls in parallel
    const toolUseBlocks = result.content.filter(b => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const toolResult = await executeTool(block.name, block.input, supabase, userId);
        console.log(`🔧 Tool ${block.name}:`, JSON.stringify(toolResult).slice(0, 200));
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult)
        };
      })
    );

    msgs.push({ role: 'user', content: toolResults });
  }

  return 'Maximum iterations reached — please try again.';
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};

  // ── AI feedback mode ──────────────────────────────────────────────────────
  if (body.feedback === true) {
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    const { fleet_id, user_id, load_id, rating, comment, analysis, load_data } = body;
    if (!load_id || !rating || !['up', 'down'].includes(rating)) {
      return res.status(400).json({ error: 'Missing required fields: load_id, rating' });
    }
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error } = await supabase.from('org_ai_feedback').insert({
        fleet_id: fleet_id || null,
        user_id: user_id || null,
        load_id,
        rating,
        comment: comment?.trim() || null,
        analysis: analysis || null,
        load_data: load_data || null,
      });
      if (error) {
        console.error('ai feedback insert error:', error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('ai feedback error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  // ── Co-driver chat mode ───────────────────────────────────────────────────
  if (body.messages) {
    const { messages, context, contextData } = body;
    if (!messages?.length || !context || !contextData) {
      return res.status(400).json({ error: 'Missing required chat fields' });
    }

    // Verify user for tool use
    let userId = null;
    let supabase = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && supabaseUrl && supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    // Fetch org history for results context (same signal Ask AI uses)
    let coDriverOrgHistory = null;
    if (context === 'results' && contextData?.fleet?.id) {
      coDriverOrgHistory = await fetchOrgHistory(contextData.fleet.id);
    }

    const systemPrompt = buildSystemPrompt(context, contextData, !!userId, coDriverOrgHistory);
    const canUseTool = !!(userId && supabase);

    try {
      let reply;
      if (canUseTool) {
        reply = await runWithTools(messages, systemPrompt, supabase, userId);
      } else {
        const result = await callClaude({ messages, system: systemPrompt });
        reply = result.content?.find(b => b.type === 'text')?.text || '';
      }
      return res.status(200).json({ reply });
    } catch (err) {
      console.error('Co-driver chat error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred' });
    }
  }

  // ── Single load analysis mode ─────────────────────────────────────────────
  const { match, fleet, request } = body;
  if (!match || !fleet || !request) {
    console.error('analyze-load: missing fields — match:', !!match, 'fleet:', !!fleet, 'request:', !!request);
    return res.status(400).json({ error: 'Missing required fields: match, fleet, request' });
  }

  // Fetch org history in parallel with prompt construction (non-blocking)
  const orgHistory = await fetchOrgHistory(fleet.id);

  const hasRateConfig = match.has_rate_config;

  // Resolve field names — match object uses several aliases
  const loadMiles        = match.pickup_to_delivery_miles ?? match.distance_miles ?? match.distance ?? 0;
  const oorMiles         = match.additionalMiles ?? match.additional_miles ?? 0;
  const toPickup         = match.datum_to_pickup_miles ?? match.finalToPickup ?? 0;
  const toHome           = match.delivery_to_home_miles ?? 0;
  const rpm              = match.revenuePerMile ?? match.revenue_per_mile ?? 0;
  const revenue          = match.totalRevenue ?? match.total_revenue ?? 0;
  const pickupDate       = match.pickupDate ?? match.ship_date ?? 'Not specified';
  const equipment        = match.equipmentType ?? match.equipment_type ?? '';
  const weight           = match.weight_lbs ?? match.weight;
  const postedRpm        = match.posted_rate_per_mile ?? null;
  const isFullLoad       = match.full_load ?? null;
  const ageMinutes       = match.age_minutes ?? null;

  // Trailer type match context
  const fleetTrailerType = fleet.fleet_profiles?.[0]?.trailer_type || fleet.trailer_type || null;
  const isTypeMismatch = match.trailer_type_match === false;
  const typeMatchLine = isTypeMismatch
    ? `- Equipment match: MISMATCH — fleet runs ${fleetTrailerType}, load requires ${equipment}`
    : (fleetTrailerType && equipment)
      ? `- Equipment match: ✓ Both ${fleetTrailerType}`
      : `- Equipment match: N/A (type not specified on one or both sides)`;

  const financialSection = hasRateConfig
    ? `FINANCIAL BREAKDOWN (fleet rate config applied):
- Gross revenue: $${revenue.toFixed(2)}
- Customer net credit: $${match.customer_net_credit?.toFixed(2)} (positive = profitable for customer)
- Carrier revenue: $${match.carrier_revenue?.toFixed(2)}
- Mileage expense: $${match.mileage_expense?.toFixed(2)} (${oorMiles} OOR mi × fleet rate)
- Fuel surcharge: $${match.fuel_surcharge?.toFixed(2)}
- Fleet cost/mile: $${(fleet.cost_per_mile ?? 0).toFixed(3)}/mi
- Fleet target RPM: $${(fleet.target_rpm ?? 0).toFixed(3)}/mi`
    : `RATE INFO:
- Gross revenue: $${revenue.toFixed(2)}
- Revenue per backhaul mile (total route): $${rpm.toFixed(3)}/mi${postedRpm ? `\n- Shipper posted rate (load miles only): $${Number(postedRpm).toFixed(2)}/mi` : ''}
- No fleet cost config — evaluate against typical market rate for ${equipment || 'this equipment type'}`;

  const typeMismatchNote = isTypeMismatch
    ? `\nEQUIPMENT NOTE: This load requires ${equipment} but the fleet runs ${fleetTrailerType}. Factor in whether the driver can legally and practically haul this load type. If it's incompatible (e.g., reefer load on a dry van), that's a hard PASS. If it's adjacent (e.g., flatbed load on a step deck), note the constraint and let the dispatcher decide.`
    : '';

  const ageNote = ageMinutes != null
    ? (ageMinutes > 240 ? ` (posted ${Math.round(ageMinutes / 60)}h ago — verify still available)` : ` (posted ${ageMinutes}min ago)`)
    : '';

  const prompt = `You are advising a freight dispatcher on a BACKHAUL opportunity — the truck is already out and needs to get home. The alternative to taking this load is deadheading home empty with zero revenue. Evaluate accordingly: a load that covers fuel + some profit is almost always better than nothing.

LOAD:
- Route: ${match.origin?.address} → ${match.destination?.address}
- Load miles: ${loadMiles} mi
- Equipment: ${equipment}${weight ? `, ${Number(weight).toLocaleString()} lbs` : ''}${isFullLoad != null ? ` | ${isFullLoad ? 'Full load' : 'Partial load'}` : ''}
${typeMatchLine}
- Pickup date: ${pickupDate}${ageNote}
- Broker: ${match.broker || 'Unknown'}

${financialSection}

ROUTE CONTEXT:
- Truck currently at: ${request.datum_point}
- Fleet home: ${fleet.home_city || fleet.home_address || 'on file'}
- Fleet trailer type: ${fleetTrailerType || 'not specified'}
- Miles to pickup from current location: ${toPickup} mi
- Out-of-route (OOR) miles added vs. going straight home: ${oorMiles} mi
- Miles from delivery to home: ${toHome} mi
- Rank among all matches: #${(match.rank ?? 0) + 1}
${typeMismatchNote}
Lead with TAKE IT, PASS, or NEGOTIATE. Then 2–3 sentences on the key factors. Remember: this is a backhaul — the bar is lower than a primary load. Only say PASS if the OOR miles are excessive, the rate is genuinely below cost, there's a clear red flag, or the equipment type is incompatible.`;

  const systemPrompt = [
    'You are a practical freight dispatching advisor. You give short, direct backhaul recommendations. The truck is already out and needs to get home — deadheading is the alternative. Focus on: does this cover cost and make meaningful money relative to the OOR miles added? If there is an equipment type mismatch, flag it clearly — a reefer load on a dry van is a hard no, but adjacent types (flatbed/step deck, dry van/power only) are judgment calls worth flagging. Be direct. Never use bullet points. 2–3 sentences after your verdict.',
    orgHistory ? `\nORG HISTORY — use this to calibrate your recommendation to what this fleet has actually accepted and what they\'ve pushed back on:\n${orgHistory}` : null,
  ].filter(Boolean).join('\n');

  try {
    const result = await callClaude({
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt,
      maxTokens: 300
    });
    return res.status(200).json({ analysis: result.content?.find(b => b.type === 'text')?.text || '' });
  } catch (err) {
    console.error('analyze-load error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ── System prompt builders ────────────────────────────────────────────────────

function buildSystemPrompt(context, contextData, canAct, orgHistory = null) {
  const actionInstructions = canAct ? `
You can take real actions in the system using your tools:
- list_fleets — see the user's fleets and their IDs (call this first when you need a fleet_id)
- create_fleet — create a new fleet profile
- create_backhaul_request — create a new backhaul request
- create_driver — add a driver to a fleet
- create_truck — add a truck to a fleet

CRITICAL: Before calling any creation tool, always summarize what you're about to create and ask the user to confirm. Only call the tool after they say yes, go ahead, or similar confirmation.` : `
Note: You are in read-only mode. You can discuss and advise but cannot create records in this session.`;

  if (context === 'dashboard') {
    const { fleets = [], activeRequests = 0, completedRequests = 0, openEstimates = 0, recentActivity = [] } = contextData;
    const fleetSummary = fleets.length
      ? fleets.map(f => `  - "${f.name}" (ID: ${f.id}) | ${f.trailer_type || 'equipment not set'} | home: ${f.home_city || 'not set'}`).join('\n')
      : '  (no fleets yet)';
    const recentSummary = recentActivity.length
      ? recentActivity.slice(0, 5).map(r => `  - ${r.request_name || r.name} (${r.status}) — ${new Date(r.created_at).toLocaleDateString()}`).join('\n')
      : '  (no recent activity)';

    return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. You help fleet operators run their backhaul operation conversationally.
${actionInstructions}

CURRENT FLEET OVERVIEW:
Fleets: ${fleets.length}
${fleetSummary}

REQUESTS:
- Active backhaul requests: ${activeRequests}
- Open estimates: ${openEstimates}
- Completed hauls: ${completedRequests}

RECENT ACTIVITY:
${recentSummary}

For backhaul estimates, reason through typical lane rates and market conditions. Ask for datum point, home location, and equipment type — then give a realistic RPM estimate and load outlook for that lane. Be conversational, practical, and direct. No bullet-point lists in responses unless specifically helpful.

PRODUCT KNOWLEDGE BASE — use this to answer any how-to or support questions:
${KNOWLEDGE_BASE}

If asked something you cannot resolve after a genuine attempt, offer to escalate: "You can email support@haulmonitor.cloud and we'll get back to you shortly."`;
  }

  if (context === 'results') {
    const { matches = [], fleet = {}, request = {} } = contextData;
    const fleetTrailerType = fleet.fleet_profiles?.[0]?.trailer_type || fleet.trailer_type || null;
    const matchSummary = matches.map((m, i) => {
      const rpm = m.revenuePerMile ? `$${m.revenuePerMile.toFixed(2)}/mi` : 'no rate';
      const net = m.has_rate_config ? ` | net $${m.customer_net_credit?.toFixed(0)}` : '';
      const typeFlag = m.trailer_type_match === false ? ' ⚠ type mismatch' : '';
      return `  #${i + 1}: ${m.origin?.address} → ${m.destination?.address} | ${m.equipmentType || m.equipment_type || '?'} | $${m.totalRevenue?.toFixed(0)} (${rpm})${net} | ${m.additionalMiles} OOR mi | ${m.finalToPickup} mi to pickup${typeFlag}`;
    }).join('\n');

    return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. Help the dispatcher evaluate these backhaul results.
${actionInstructions}

REQUEST: ${request.request_name || 'Open request'}
Datum (truck location): ${request.datum_point || 'unknown'}
Fleet home: ${fleet.home_city || fleet.home_address || 'on file'}
Fleet trailer type: ${fleetTrailerType || 'not specified'}

LOAD RESULTS (${matches.length} matches, best first):
${matchSummary || '  No matches.'}
${orgHistory ? `\nORG HISTORY — calibrate your answers to what this fleet has actually accepted and what they've pushed back on:\n${orgHistory}` : ''}
Answer questions about these loads directly. Reference specific loads by number. No disclaimers.

PRODUCT KNOWLEDGE BASE — use this to answer any how-to or support questions:
${KNOWLEDGE_BASE}

If asked something you cannot resolve after a genuine attempt, offer to escalate: "You can email support@haulmonitor.cloud and we'll get back to you shortly."`;
  }

  if (context === 'requests') {
    const { requests = [] } = contextData;
    const summary = requests.map((r, i) =>
      `  ${i + 1}. "${r.request_name}" | Datum: ${r.datum_point || 'not set'} | Equipment: ${r.equipment_type || 'not set'} | Status: ${r.status} | ${new Date(r.created_at).toLocaleDateString()}`
    ).join('\n');

    return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. Help the dispatcher manage their open backhaul requests.
${actionInstructions}

OPEN REQUESTS (${requests.length} total):
${summary || '  No open requests.'}

Answer questions about these requests concisely. Help prioritize, spot patterns, or think through next moves.

PRODUCT KNOWLEDGE BASE — use this to answer any how-to or support questions:
${KNOWLEDGE_BASE}

If asked something you cannot resolve after a genuine attempt, offer to escalate: "You can email support@haulmonitor.cloud and we'll get back to you shortly."`;
  }

  if (context === 'support') {
    return `You are the Haul Monitor support assistant — a knowledgeable, friendly tier-1 support agent built into the app. Help users with functional questions ("how do I..."), troubleshooting ("why isn't X working"), and product understanding.

You have access to a comprehensive knowledge base about Haul Monitor. Use it to answer questions accurately and concisely. If the user is authenticated, you can call list_fleets to look up their specific fleet data when it would help answer their question.

${KNOWLEDGE_BASE}

ESCALATION RULE: If you cannot resolve the issue after a genuine attempt — or if the user explicitly asks to talk to a person — offer to escalate. When escalating, say something like: "I wasn't able to fully resolve this one. You can email our support team at support@haulmonitor.cloud — include [brief summary of the issue] and we'll get back to you shortly." Do not offer escalation prematurely; try to answer first.

${canAct ? `You can call list_fleets to look up the user's fleet details if relevant to their question. Do not call any creation tools in support mode.` : 'You are in read-only mode.'}

Keep responses clear and direct. When walking through steps, use numbered lists. No unnecessary caveats.`;
  }

  return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. Help the dispatcher with backhaul decisions.${actionInstructions}`;
}

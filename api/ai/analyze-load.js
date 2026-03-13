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

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const body = req.body || {};

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

    const systemPrompt = buildSystemPrompt(context, contextData, !!userId);
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

  const hasRateConfig = match.has_rate_config;
  const financialSection = hasRateConfig
    ? `
FINANCIAL BREAKDOWN (fleet rate config applied):
- Gross revenue: $${match.totalRevenue?.toFixed(2)}
- Customer share: $${match.customer_share?.toFixed(2)}
- Mileage expense: $${match.mileage_expense?.toFixed(2)}
- Stop expense (${match.stop_count} stops): $${match.stop_expense?.toFixed(2)}
- Fuel surcharge: $${match.fuel_surcharge?.toFixed(2)}
- Other charges: $${match.other_charges?.toFixed(2)}
- Carrier revenue: $${match.carrier_revenue?.toFixed(2)}
- Customer net credit: $${match.customer_net_credit?.toFixed(2)}
- Fleet cost/mile: $${fleet.cost_per_mile?.toFixed(3)}/mi
- Fleet target RPM: $${fleet.target_rpm?.toFixed(3)}/mi`
    : `
RATE INFO:
- Gross revenue: $${match.totalRevenue?.toFixed(2)}
- Rate per mile: $${match.revenuePerMile?.toFixed(3)}/mi`;

  const prompt = `Analyze this backhaul load opportunity for a fleet dispatcher:

LOAD:
- Route: ${match.origin?.address} → ${match.destination?.address}
- Load distance: ${match.distance} miles
- Equipment: ${match.equipmentType}, ${match.weight?.toLocaleString()} lbs, ${match.trailerLength} ft
- Pickup date: ${match.pickupDate || 'Not specified'}
- Broker: ${match.broker || 'Unknown'}
- Freight type: ${match.freightType || 'General'}
${financialSection}

ROUTE CONTEXT:
- Datum point (where truck currently is): ${request.datum_point}
- Fleet home: ${fleet.home_city || fleet.home_address || 'on file'}
- Miles to pickup from datum: ${match.finalToPickup} mi
- Miles out of route (OOR): ${match.additionalMiles} mi
- Rank among results: #${(match.rank ?? 0) + 1}

Give a concise dispatcher recommendation. Lead with TAKE IT, PASS, or NEGOTIATE. Then 2-3 sentences max on the key factors. Be direct and practical — this is for a working dispatcher, not a report.`;

  try {
    const result = await callClaude({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a practical freight dispatching advisor. You give short, direct load recommendations to fleet dispatchers. Focus on the numbers that matter: rate per mile vs cost, out-of-route miles, and whether the load actually gets the driver toward home. Never use bullet points — write in plain sentences.',
      maxTokens: 300
    });
    return res.status(200).json({ analysis: result.content?.find(b => b.type === 'text')?.text || '' });
  } catch (err) {
    console.error('analyze-load error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ── System prompt builders ────────────────────────────────────────────────────

function buildSystemPrompt(context, contextData, canAct) {
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

For backhaul estimates, reason through typical lane rates and market conditions. Ask for datum point, home location, and equipment type — then give a realistic RPM estimate and load outlook for that lane. Be conversational, practical, and direct. No bullet-point lists in responses unless specifically helpful.`;
  }

  if (context === 'results') {
    const { matches = [], fleet = {}, request = {} } = contextData;
    const matchSummary = matches.map((m, i) => {
      const rpm = m.revenuePerMile ? `$${m.revenuePerMile.toFixed(2)}/mi` : 'no rate';
      const net = m.has_rate_config ? ` | net $${m.customer_net_credit?.toFixed(0)}` : '';
      return `  #${i + 1}: ${m.origin?.address} → ${m.destination?.address} | ${m.distance} mi | $${m.totalRevenue?.toFixed(0)} (${rpm})${net} | ${m.additionalMiles} OOR mi | ${m.finalToPickup} mi to pickup | broker: ${m.broker || 'unknown'}`;
    }).join('\n');

    return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. Help the dispatcher evaluate these backhaul results.
${actionInstructions}

REQUEST: ${request.request_name || 'Open request'}
Datum (truck location): ${request.datum_point || 'unknown'}
Fleet home: ${fleet.home_city || fleet.home_address || 'on file'}
Equipment: ${fleet.trailer_type || 'on file'}

LOAD RESULTS (${matches.length} matches, best first):
${matchSummary || '  No matches.'}

Answer questions about these loads directly. Reference specific loads by number. No disclaimers.`;
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

Answer questions about these requests concisely. Help prioritize, spot patterns, or think through next moves.`;
  }

  return `You are Co-driver, an AI dispatch assistant built into Haul Monitor. Help the dispatcher with backhaul decisions.${actionInstructions}`;
}

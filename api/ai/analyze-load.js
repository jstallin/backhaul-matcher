/**
 * POST /api/ai/analyze-load
 *
 * Two modes, differentiated by request body:
 *   { match, fleet, request }          → single load analysis (one-shot)
 *   { messages, context, contextData } → co-pilot chat (multi-turn)
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

  // ── Co-pilot chat mode ────────────────────────────────────────────────────
  if (body.messages) {
    const { messages, context, contextData } = body;
    if (!messages?.length || !context || !contextData) {
      return res.status(400).json({ error: 'Missing required chat fields' });
    }

    const systemPrompt = buildSystemPrompt(context, contextData);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: systemPrompt,
          messages
        })
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic chat error:', response.status, err);
        return res.status(502).json({ error: 'AI service error' });
      }

      const data = await response.json();
      return res.status(200).json({ reply: data.content?.[0]?.text || '' });
    } catch (err) {
      console.error('co-pilot chat error:', err);
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'You are a practical freight dispatching advisor. You give short, direct load recommendations to fleet dispatchers. Focus on the numbers that matter: rate per mile vs cost, out-of-route miles, and whether the load actually gets the driver toward home. Never use bullet points — write in plain sentences.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    return res.status(200).json({ analysis: data.content?.[0]?.text || '' });
  } catch (err) {
    console.error('analyze-load error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ── System prompt builders ────────────────────────────────────────────────────

function buildSystemPrompt(context, contextData) {
  if (context === 'results') {
    const { matches = [], fleet = {}, request = {} } = contextData;
    const matchSummary = matches.map((m, i) => {
      const rpm = m.revenuePerMile ? `$${m.revenuePerMile.toFixed(2)}/mi` : 'no rate';
      const net = m.has_rate_config ? ` | net credit $${m.customer_net_credit?.toFixed(0)}` : '';
      return `#${i + 1}: ${m.origin?.address} → ${m.destination?.address} | ${m.distance} mi | $${m.totalRevenue?.toFixed(0)} (${rpm})${net} | ${m.additionalMiles} OOR mi | ${m.finalToPickup} mi to pickup | broker: ${m.broker || 'unknown'}`;
    }).join('\n');

    return `You are a freight dispatch co-pilot for ${fleet.name || 'this fleet'}. You help dispatchers evaluate backhaul load results.

REQUEST: ${request.request_name || 'Open request'}
Datum point (truck location): ${request.datum_point || 'unknown'}
Fleet home: ${fleet.home_city || fleet.home_address || 'on file'}
Equipment: ${fleet.trailer_type || 'on file'}

LOAD RESULTS (${matches.length} matches, best first):
${matchSummary || 'No matches available.'}

Answer questions about these loads directly and concisely. You know all the numbers above — reference them. No disclaimers, no bullet points unless specifically helpful. If asked which load is best for a specific goal, give a clear answer with the reason.`;
  }

  if (context === 'requests') {
    const { requests = [] } = contextData;
    const summary = requests.map((r, i) => {
      const status = r.status || 'active';
      return `${i + 1}. "${r.request_name}" | Datum: ${r.datum_point || 'not set'} | Equipment: ${r.equipment_type || 'not set'} | Status: ${status} | Created: ${r.created_at ? new Date(r.created_at).toLocaleDateString() : 'unknown'}`;
    }).join('\n');

    return `You are a freight dispatch co-pilot. You help dispatchers manage their open backhaul requests.

OPEN REQUESTS (${requests.length} total):
${summary || 'No open requests.'}

Answer questions about these requests concisely. Help the dispatcher understand their pipeline, prioritize, or think through their next move.`;
  }

  return 'You are a freight dispatch co-pilot. Help the dispatcher with backhaul decisions.';
}

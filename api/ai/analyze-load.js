/**
 * POST /api/ai/analyze-load
 *
 * Analyzes a backhaul load opportunity using Claude and returns
 * a dispatcher-focused recommendation.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const { match, fleet, request } = req.body || {};
  if (!match || !fleet || !request) {
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
    const text = data.content?.[0]?.text || '';

    return res.status(200).json({ analysis: text });
  } catch (err) {
    console.error('analyze-load error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

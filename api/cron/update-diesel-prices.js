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

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('Unauthorized cron request attempted');
    return res.status(401).json({ error: 'Unauthorized' });
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

    return res.status(200).json({
      success: true,
      regionsFound: regionCount,
      profilesUpdated: updatedCount,
      prices: Object.fromEntries(
        Object.entries(prices).map(([r, p]) => [r, `$${p.price}/gal (${p.period})`])
      )
    });
  } catch (err) {
    console.error('Diesel price update failed:', err.message);
    return res.status(500).json({
      error: 'Failed to update diesel prices',
      details: err.message
    });
  }
}

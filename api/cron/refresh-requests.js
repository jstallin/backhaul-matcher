import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import twilio from 'twilio';
import { detectNotifiableChange, snapshotFromMatches } from '../../src/utils/notificationChangeDetection.js';
import { isRequestExpired } from '../../src/utils/requestExpiry.js';
import { effectiveNotificationMethod } from '../../src/utils/smsConsent.js';
import { brandSms } from '../../src/utils/smsBody.js';
import { toE164 } from '../../src/utils/phone.js';
import { isWithinNotifyWindow, usTimeZoneFromCoords } from '../../src/utils/quietHours.js';
// PR1: server-side auto-refresh now runs the SAME matching algorithm the client uses,
// instead of a divergent inlined copy. pcMilerClient detects the server context and calls
// PC*MILER directly with PCMILER_API_KEY; supabase.js reads process.env server-side.
import { findRouteHomeBackhauls, effectivePickupDate } from '../../src/utils/routeHomeMatching.js';
import { unionModes } from '../../src/utils/fleetModes.js';
// PR2: live Truckstop sourcing server-side — the SAME SOAP search the client/endpoint use.
import { fetchTruckstopLoads } from '../_lib/truckstop.js';
// Unified datum geocoder shared with v1 + v2 (PC*MILER → Mapbox → local). Isomorphic:
// runs server-side here via direct PC*MILER + process.env. Replaces the old cron-only
// Mapbox+NC_CITIES geocoder so all three paths resolve the datum identically.
import { geocodeDatum } from '../../src/utils/geocodeDatum.js';

// Backhaul data will be fetched at runtime
let backhaulLoadsData = null;

const loadBackhaulData = async () => {
  if (backhaulLoadsData) return backhaulLoadsData;

  try {
    // Fetch from the deployed app's public data
    const response = await fetch('https://haulmonitor.cloud/backhaul_loads_data.json');
    if (response.ok) {
      backhaulLoadsData = await response.json();
      return backhaulLoadsData;
    }
  } catch (e) {
    console.error('Failed to fetch backhaul data:', e.message);
  }

  return [];
};

// Initialize Supabase client for server-side
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// NOTE: the matching algorithm previously lived here as an inlined, divergent copy of
// routeHomeMatching.js (no net revenue, no relay, no date window, Haversine-only corridor).
// PR1 deleted it — the cron now imports the real findRouteHomeBackhauls (see top of file)
// so server-side auto-refresh is full-fidelity and there is a single source of truth.

// Datum geocoding now uses the shared, isomorphic geocodeDatum (imported above) —
// the SAME PC*MILER → Mapbox → local chain v1 and v2 use, so all three paths agree.

// PR2: resolve a request owner's per-org Truckstop integration ID using the service-role
// client (the cron has no user JWT). Mirrors handleTruckstop in api/integrations/[provider].js
// (org_memberships → get_ts_integration_id RPC). Returns null when the org isn't connected,
// so the caller falls back to the static load set — same NOT_CONNECTED behavior as the client.
const getOrgTruckstopIntegrationId = async (userId) => {
  if (!userId) return null;
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle();
  const orgId = membership?.org_id;
  if (!orgId) return null;
  const { data: integrationId } = await supabase.rpc('get_ts_integration_id', { p_org_id: orgId });
  return integrationId || null;
};

// PR2: fetch live Truckstop loads for one request's org, mirroring the client's
// getLoadsForMatching → /api/integrations/truckstop?action=loads params (radius 150,
// fleet+request modes, pickup window).
//
// Return contract distinguishes "not connected" from "connected, no loads":
//   - null  → org is NOT connected (no integration ID / no WS creds). Caller MAY use the
//             static demo set (dev convenience only).
//   - array → org IS connected; this is authoritative live inventory. Returned as-is even
//             when EMPTY, and [] on a hard error — so a connected (pilot) org is NEVER
//             matched against the demo set (which would fabricate matches and could charge
//             a credit on a fake "material" change).
const getLiveTruckstopLoads = async (request, rawProfile) => {
  const username = process.env.TRUCKSTOP_WS_USERNAME;
  const password = process.env.TRUCKSTOP_WS_PASSWORD;
  if (!username || !password) return null;

  const integrationId = await getOrgTruckstopIntegrationId(request.user_id);
  if (!integrationId) {
    console.log('  ℹ️ Org not connected to Truckstop — using static loads');
    return null;
  }

  const [datumCityParsed = '', datumStateParsed = ''] = (request.datum_point || '').split(',').map(s => s.trim());
  const tsParams = {
    originCity:    request.datum_city || datumCityParsed,
    originState:   request.datum_state || datumStateParsed,
    // Default to 'Dry Van' (matches SearchView) — a null type becomes the all-equipment
    // filter "V F R SD LB", which Truckstop returns 0 for.
    equipmentType: rawProfile?.trailer_type || 'Dry Van',
    modes:         unionModes(rawProfile?.modes, request.modes), // #36: fleet + request modes
    radiusMiles:   150,
    pickupDate:    effectivePickupDate(request.equipment_available_date),
    pickupDateEnd: request.equipment_needed_date || '',
    // #158: optional per-request max load weight; null = no limit
    maxWeightLbs:  request.max_weight_lbs ?? null,
  };
  try {
    const loads = await fetchTruckstopLoads({ integrationId, username, password, ...tsParams });
    // Connected: live result is authoritative, even when empty. Never demo.
    return loads || [];
  } catch (err) {
    // Connected but the live fetch errored — return 0 live loads, NOT demo.
    console.warn('  ⚠️ Live Truckstop fetch failed (connected org) — using 0 live loads, not demo:', err?.message || err);
    return [];
  }
};

// PR3: pilot-org check (mirrors isInPilotOrg in api/stripe/index.js). Pilot orgs aren't
// charged — instead a type='pilot' ledger row records the would-be charge for the admin
// revenue projection (#131). Active window only.
const isInPilotOrg = async (userId) => {
  if (!userId) return false;
  const { data } = await supabase
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
};

// PR3: charge for a value-delivering (material) auto-refresh and log a search_run
// activity event so the admin dashboard's Last Search + revenue reflect it. Mirrors the
// stripe deduct path: pilot orgs get a would-be ledger row (balance untouched), everyone
// else hits the deduct_credit RPC. Telemetry/charge failures are logged, never thrown —
// a billing hiccup must not abort the refresh loop. Returns true if a credit was charged.
const DESC = 'Auto-refresh (material change)';
const chargeForMaterialRefresh = async (userId, requestId) => {
  if (!userId) return false;
  let charged = false;
  try {
    if (await isInPilotOrg(userId)) {
      const { error } = await supabase
        .from('credit_transactions')
        .insert({ user_id: userId, amount: -1, type: 'pilot', description: DESC });
      if (error) console.error('  ⚠️ Pilot would-be credit record failed:', error.message);
    } else {
      const { data: ok, error } = await supabase.rpc('deduct_credit', {
        p_user_id: userId, p_amount: 1, p_description: DESC,
      });
      if (error) console.error('  ⚠️ Auto-refresh credit deduction failed:', error.message);
      else if (!ok) console.warn('  ⚠️ Auto-refresh: insufficient credits (notification still sent)');
      else charged = true;
    }
  } catch (e) {
    console.error('  ⚠️ chargeForMaterialRefresh error:', e?.message || e);
  }

  // Activity event (search_run) — only material refreshes count as a "search" on the
  // admin dashboard, matching the client's logActivityEvent(SEARCH_RUN) semantics.
  try {
    const { error } = await supabase
      .from('user_activity_events')
      .insert({ user_id: userId, event_type: 'search_run', metadata: { kind: 'backhaul', request_id: requestId, source: 'auto_refresh' } });
    if (error) console.error('  ⚠️ Activity event insert failed:', error.message);
  } catch (e) {
    console.error('  ⚠️ Activity event error:', e?.message || e);
  }
  return charged;
};

// ============================================
// NOTIFICATION LOGIC
// ============================================

// Change detection now lives in the shared, unit-tested detector
// (src/utils/notificationChangeDetection.js) so the cron and client agree.

// Net-based notification copy (item #48) with a deep-link to the request results (#51).
const buildNotificationMessage = (requestName, change, link) => {
  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  // arrow defaults to → for email; SMS passes '->' to stay in GSM-7 (a Unicode arrow
  // forces UCS-2, ~halving the per-segment budget and multiplying segment cost).
  const routeOf = (m, arrow = '→') => m ? `${m.origin?.city}, ${m.origin?.state} ${arrow} ${m.destination?.city}, ${m.destination?.state}` : '';

  let subject, body, sms;
  switch (change.type) {
    case 'new_top':
      subject = `🎯 New top backhaul for ${requestName}`;
      body = `New #1 backhaul for "${requestName}".\n\nRoute: ${routeOf(change.match)}\nNet revenue: ${fmt(change.newNet)}`;
      sms = `New #1 backhaul for "${requestName}" (${routeOf(change.match, '->')}): ${fmt(change.newNet)} net. View: ${link}`;
      break;
    case 'top_net_up':
      subject = `📈 Top backhaul improved for ${requestName}`;
      body = `Your top backhaul's net revenue rose ${Math.round(change.pct)}% for "${requestName}".\n\nRoute: ${routeOf(change.match)}\nNet revenue: ${fmt(change.newNet)}`;
      sms = `Top backhaul up ${Math.round(change.pct)}% for "${requestName}" (${routeOf(change.match, '->')}): ${fmt(change.newNet)} net. View: ${link}`;
      break;
    case 'lane_softening':
      subject = `📉 Lane softening for ${requestName}`;
      body = `Average net revenue across your top loads for "${requestName}" is down ${Math.abs(Math.round(change.pct))}% (avg ${fmt(change.avgNet)}). You may want to act soon.`;
      sms = `Heads up: top loads for "${requestName}" softening (avg ${fmt(change.avgNet)} net). View: ${link}`;
      break;
    default:
      subject = `Backhaul update for ${requestName}`;
      body = `There's an update for your backhaul request "${requestName}".`;
      sms = `Backhaul update for "${requestName}". View: ${link}`;
  }
  const text = `${body}\n\nView this request: ${link}`;
  return { subject, text, sms };
};

const sendNotification = async (method, email, phone, subject, text, sms) => {
  const results = { email: null, sms: null };

  // Debug logging
  console.log('📧 sendNotification called:', {
    method,
    email: email || '(not set)',
    phone: phone || '(not set)',
    subject,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasTwilioConfig: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
  });

  // Send email
  if ((method === 'email' || method === 'both') && email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        console.log(`📤 Attempting to send email to ${email}...`);
        const { data, error } = await resend.emails.send({
          from: 'Haul Monitor <notifications@haulmonitor.cloud>',
          to: [email],
          subject,
          text
        });
        if (error) {
          results.email = { success: false, error: error.message };
          console.error(`❌ Email failed:`, error);
        } else {
          results.email = { success: true, id: data?.id };
          console.log(`✅ Email sent to ${email}, id: ${data?.id}`);
        }
      } catch (error) {
        results.email = { success: false, error: error.message };
        console.error(`❌ Email exception: ${error.message}`);
      }
    } else {
      console.log('⚠️ Skipping email - RESEND_API_KEY not configured');
      results.email = { success: false, error: 'RESEND_API_KEY not configured' };
    }
  } else {
    console.log(`⚠️ Skipping email - method=${method}, email=${email || 'not set'}`);
  }

  // Send SMS via Twilio (item #52 — replaces the unreliable email-to-carrier-gateway).
  if ((method === 'text' || method === 'both') && phone) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    // Fleet phones are stored free-form; Twilio requires E.164 (+1XXXXXXXXXX) or it
    // rejects with err 21211. Normalize, and skip (not throw) on an unparseable number.
    const smsTo = toE164(phone);

    if (!smsTo) {
      console.warn(`⚠️ Skipping SMS — unparseable phone "${phone}" (expected US 10-digit or E.164)`);
      results.sms = { success: false, error: 'Invalid phone number' };
    } else if (accountSid && authToken && fromNumber) {
      try {
        console.log(`📤 Attempting to send SMS via Twilio to ${smsTo}...`);
        const client = twilio(accountSid, authToken);
        const result = await client.messages.create({
          // #140: slice the core first, then brand — so the STOP reminder is never truncated.
          body: brandSms((sms || text || '').slice(0, 300)),
          from: fromNumber,
          to: smsTo,
        });
        results.sms = { success: true, id: result.sid };
        console.log(`✅ SMS sent via Twilio to ${smsTo}, sid: ${result.sid}`);
      } catch (error) {
        results.sms = { success: false, error: error.message, code: error.code };
        console.error(`❌ Twilio SMS failed: ${error.message} (code ${error.code})`);
      }
    } else {
      console.log('⚠️ Skipping SMS - Twilio env vars not set (TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER)');
      results.sms = { success: false, error: 'Twilio not configured' };
    }
  } else {
    console.log(`⚠️ Skipping SMS - method=${method}, phone=${phone || 'not set'}`);
  }

  console.log('📧 sendNotification results:', results);
  return results;
};

// ============================================
// MAIN CRON HANDLER
// ============================================

// ─── Trimble Monthly Report ───────────────────────────────────────────────────

const APP_URL = process.env.VITE_APP_URL || 'https://haulmonitor.cloud';

function getTrimbleBillingTier(billingStartDate, reportMonthStart) {
  if (!billingStartDate) return { perLoad: 0.10, minimum: 0, tier: null };
  const start = new Date(billingStartDate);
  const report = new Date(reportMonthStart);
  const monthsElapsed =
    (report.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (report.getUTCMonth() - start.getUTCMonth());
  if (monthsElapsed < 3) return { perLoad: 0.10, minimum: 0,   tier: '1–3' };
  if (monthsElapsed < 6) return { perLoad: 0.10, minimum: 250, tier: '4–6' };
  return                        { perLoad: 0.10, minimum: 500, tier: '7+' };
}

function fmtTrimbleDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' CT';
}

function buildTrimbleReportHtml({ monthLabel, loads, billing }) {
  const { perLoad, minimum, tier } = billing;
  const rawCost = loads.length * perLoad;
  const estimatedCost = Math.max(rawCost, minimum);
  const tierNote = tier
    ? `Month tier ${tier}: $${perLoad.toFixed(2)}/load${minimum > 0 ? `, $${minimum.toLocaleString()} minimum` : ''}`
    : `$${perLoad.toFixed(2)}/load`;

  const rows = loads.length > 0
    ? loads.map((l, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'}">
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px">${fmtTrimbleDateTime(l.completed_at)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;font-family:monospace">${l.hauled_load_id || '—'}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;text-transform:capitalize">${l.hauled_load_source || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px">No hauled loads recorded this month.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Haul Monitor — Trimble Actuals Report ${monthLabel}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:700px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#1e40af;padding:32px 40px;display:flex;align-items:center;gap:20px">
      <img src="${APP_URL}/haul-monitor-logo.png" alt="Haul Monitor" style="height:48px;width:auto" />
      <div>
        <div style="color:#ffffff;font-size:20px;font-weight:700">Trimble Actuals Report</div>
        <div style="color:#bfdbfe;font-size:14px;margin-top:4px">${monthLabel}</div>
      </div>
    </div>
    <div style="background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:20px 40px;display:flex;gap:40px">
      <div>
        <div style="font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:.06em">Total Loads</div>
        <div style="font-size:28px;font-weight:700;color:#1e40af;margin-top:2px">${loads.length}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:.06em">Estimated Cost</div>
        <div style="font-size:28px;font-weight:700;color:#1e40af;margin-top:2px">$${estimatedCost.toFixed(2)}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Pricing</div>
        <div style="font-size:13px;color:#374151;margin-top:4px">${tierNote}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">For Trimble review only</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e5e7eb">Date / Time</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e5e7eb">Load ID</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e5e7eb">Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="padding:24px 40px;border-top:1px solid #e5e7eb;background:#f9fafb">
      <div style="font-size:12px;color:#9ca3af">
        Generated by Haul Monitor on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
        This report is for internal review and Trimble billing reconciliation only.
        No user-identifying information is included.
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function handleTrimbleMonthlyReport(req, res) {
  const now = new Date();
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLabel = prevMonthStart.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

  const { data: loads, error: loadsError } = await supabase
    .from('backhaul_requests')
    .select('completed_at, hauled_load_id, hauled_load_source')
    .eq('status', 'completed')
    .gte('completed_at', prevMonthStart.toISOString())
    .lt('completed_at', prevMonthEnd.toISOString())
    .order('completed_at', { ascending: true });

  if (loadsError) {
    console.error('[trimble-report] query error:', loadsError.message);
    return res.status(500).json({ error: 'Failed to query loads' });
  }

  const { data: bsSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'trimble_billing_start')
    .maybeSingle();
  const billing = getTrimbleBillingTier(bsSetting?.value?.date || null, prevMonthStart);
  const html = buildTrimbleReportHtml({ monthLabel, loads: loads || [], billing });

  const { data: adminRows } = await supabase.from('admin_users').select('user_id');
  const adminEmails = [];
  for (const row of adminRows || []) {
    const { data: { user } } = await supabase.auth.admin.getUserById(row.user_id);
    if (user?.email) adminEmails.push(user.email);
  }

  if (adminEmails.length === 0) {
    console.warn('[trimble-report] No admin emails found — skipping send');
    return res.status(200).json({ sent: 0, month: prevMonthStart.toISOString().slice(0, 7), loads: loads.length });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'Email not configured' });

  const resend = new Resend(resendKey);
  const subject = `Haul Monitor — Trimble Actuals Report: ${monthLabel}`;
  let sent = 0;
  for (const email of adminEmails) {
    try {
      await resend.emails.send({
        from: 'Haul Monitor <notifications@haulmonitor.cloud>',
        to: [email], subject, html,
      });
      sent++;
    } catch (err) {
      console.error(`[trimble-report] Failed to send to ${email}:`, err.message);
    }
  }

  console.log(`[trimble-report] Sent ${monthLabel} (${loads.length} loads) to ${sent}/${adminEmails.length} admins`);
  return res.status(200).json({ month: prevMonthStart.toISOString().slice(0, 7), loads: loads.length, sent, admins: adminEmails.length });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.query.action === 'trimble-report') {
    return handleTrimbleMonthlyReport(req, res);
  }

  console.log('🔄 Server-side backhaul refresh starting...');
  const startTime = Date.now();

  try {
    // Static load set — the FALLBACK used per request when an org isn't connected to
    // Truckstop or a live fetch fails. Connected orgs get live loads inside the loop (PR2).
    const fallbackLoads = await loadBackhaulData();
    console.log(`📦 Loaded ${fallbackLoads.length} fallback backhaul loads`);

    // 1. Get all active requests that are due for refresh
    const now = new Date().toISOString();
    const { data: requests, error: fetchError } = await supabase
      .from('backhaul_requests')
      .select('*, fleets(*, fleet_profiles(*))')
      .in('status', ['active', 'in_progress']) // item 008: in_progress keeps auto-refreshing
      .eq('auto_refresh', true)
      .lte('next_refresh_at', now);

    if (fetchError) {
      throw new Error(`Failed to fetch requests: ${fetchError.message}`);
    }

    console.log(`📋 Found ${requests?.length || 0} requests due for refresh`);

    if (!requests || requests.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No requests due for refresh',
        processed: 0
      });
    }

    const results = [];

    // 2. Process each request
    for (const request of requests) {
      console.log(`\n🔍 Processing request: ${request.request_name}`);

      try {
        // Item 008: an in_progress request whose equipment-needed date has passed
        // auto-completes — keep the hauled load + revenue, stop auto-refresh, no refresh.
        const neededDate = request.equipment_needed_date ? String(request.equipment_needed_date).slice(0, 10) : null;
        if (request.status === 'in_progress' && neededDate && neededDate < now.slice(0, 10)) {
          await supabase
            .from('backhaul_requests')
            .update({ status: 'completed', completed_at: new Date().toISOString(), auto_refresh: false })
            .eq('id', request.id);
          console.log('  🏁 Auto-finished in_progress request past its needed date');
          results.push({ requestId: request.id, requestName: request.request_name, autoFinished: true });
          continue;
        }

        // #83: an active request past its end pickup window is expired — skip it
        // entirely (no refresh, no credit/API burn). Distinct from the in_progress
        // flip above: nothing was hauled, so it is NOT completed. The state is
        // derived, so editing the dates forward re-enables auto-refresh untouched.
        if (isRequestExpired(request)) {
          console.log('  ⏸ Skipping expired request (pickup window passed)');
          results.push({ requestId: request.id, requestName: request.request_name, skippedExpired: true });
          continue;
        }

        const fleet = request.fleets;
        if (!fleet) {
          console.log('  ⚠️ No fleet found, skipping');
          continue;
        }

        // Get fleet profile (snake_case row; findRouteHomeBackhauls reads either case).
        // PostgREST returns a one-to-one embed as an OBJECT, not an array — so `[0]`
        // yielded undefined → null rawProfile → equipmentType null (→ all-equipment
        // filter "V F R SD LB" that Truckstop returns 0 for) + no rateConfig + default
        // fleet profile. Handle both shapes, mirroring SearchView. (feedback: PostgREST
        // one-to-one join returns object not array.)
        const rawProfile = (Array.isArray(fleet.fleet_profiles) ? fleet.fleet_profiles[0] : fleet.fleet_profiles) || null;
        const fleetProfile = rawProfile || {
          trailerType: 'Dry Van',
          trailerLength: 53,
          weightLimit: 45000
        };

        // Build rateConfig from the fleet profile — same shape the client passes — so the
        // matcher computes NET revenue server-side (required for the materiality detector).
        const hasRateConfig = rawProfile && (rawProfile.revenue_split_carrier != null || rawProfile.mileage_rate != null);
        const rateConfig = hasRateConfig ? {
          revenueSplitCarrier: rawProfile.revenue_split_carrier || 20,
          mileageRate: rawProfile.mileage_rate ? parseFloat(rawProfile.mileage_rate) : 0,
          stopRate: rawProfile.stop_rate ? parseFloat(rawProfile.stop_rate) : 0,
          otherCharge1Amount: rawProfile.other_charge_1_amount ? parseFloat(rawProfile.other_charge_1_amount) : 0,
          otherCharge2Amount: rawProfile.other_charge_2_amount ? parseFloat(rawProfile.other_charge_2_amount) : 0,
          fuelPeg: rawProfile.fuel_peg ? parseFloat(rawProfile.fuel_peg) : 0,
          fuelMpg: rawProfile.fuel_mpg ? parseFloat(rawProfile.fuel_mpg) : 6,
          doePaddRate: rawProfile.doe_padd_rate ? parseFloat(rawProfile.doe_padd_rate) : 0,
        } : null;

        // Geocode datum point (unified geocoder — same as v1/v2)
        const datumCoords = await geocodeDatum(request.datum_point);
        if (!datumCoords) {
          console.log(`  ⚠️ Could not geocode datum point: ${request.datum_point}`);
          continue;
        }

        // Check fleet has coordinates
        if (!fleet.home_lat || !fleet.home_lng) {
          console.log('  ⚠️ Fleet missing home coordinates, skipping');
          continue;
        }

        // Widen the search when geocoding fell back to home coords (no real datum fix),
        // mirroring the client (SearchView.jsx) so server + client behave identically.
        const geocodeFailed = datumCoords.lat === fleet.home_lat && datumCoords.lng === fleet.home_lng;
        const homeRadiusMiles = geocodeFailed ? 200 : 100;
        const corridorWidthMiles = geocodeFailed ? 300 : 100;

        // #159: "Bypass Fleet Home" — auto-refresh must route to the same search home the
        // user set, or cron matches would diverge from the manual search results.
        const searchHome = (request.bypass_fleet_home && request.search_home_lat != null && request.search_home_lng != null)
          ? { lat: request.search_home_lat, lng: request.search_home_lng, address: request.search_home_address }
          : null;

        // PR2: live Truckstop loads for this request's org (same source the user sees).
        // null = not connected → static demo set; array (incl. empty) = connected → live.
        const liveLoads = await getLiveTruckstopLoads(request, rawProfile);
        const connected = liveLoads !== null;
        const loadsForRequest = connected ? liveLoads : fallbackLoads;
        console.log(`  📦 ${loadsForRequest.length} loads (${connected ? 'live Truckstop' : 'static fallback'})`);

        // Run the SAME matching algorithm the client uses, with full request fidelity:
        // rateConfig (net revenue), relay flag, and the pickup-date window.
        // NOTE: findRouteHomeBackhauls returns { opportunities, routeData } — unwrap to
        // the ranked array. (Passing the object straight through made matches.length /
        // matches[0] / snapshotFromMatches all undefined → material always false.)
        const matchResult = await findRouteHomeBackhauls(
          { lat: datumCoords.lat, lng: datumCoords.lng },
          { lat: fleet.home_lat, lng: fleet.home_lng },
          fleetProfile,
          loadsForRequest,
          homeRadiusMiles,
          corridorWidthMiles,
          rateConfig,
          request.is_relay || false,
          request.equipment_available_date || null,
          request.equipment_needed_date || null,
          searchHome // #159: substitutes fleet home for routing when set
        );
        const matches = matchResult?.opportunities || [];

        console.log(`  📦 Found ${matches.length} matches`);

        const topMatch = matches[0] || null;
        let notificationSent = false;
        let charged = false;

        // Materiality drives BOTH billing (PR3) and notifications: a refresh that
        // produced a materially better/worse result delivered value. Compute it once,
        // independent of notification settings. Returns null on the first run (baseline
        // established silently) and when nothing material changed — those refreshes are
        // free and never logged as a search.
        const change = topMatch
          ? detectNotifiableChange(
              { topId: request.last_top_match_id, topNet: request.last_top_net, top25AvgNet: request.last_top25_avg_net },
              matches
            )
          : null;

        if (change) {
          console.log(`  📬 Material change detected: ${change.type}`);

          // PR3: charge 1 credit for the value-delivering refresh + log a search_run
          // event. Only material refreshes cost a credit or count as a "search".
          charged = await chargeForMaterialRefresh(request.user_id, request.id);

          // Notify only when the user opted in (notification is delivery; the charge
          // above is for the value found, regardless of notification preference).
          if (request.notification_enabled) {
            const requestLink = `${APP_URL}/app?request=${request.id}`;
            const { subject, text, sms } = buildNotificationMessage(request.request_name, change, requestLink);

            // #140: only text when explicit SMS consent was recorded ('both'→email, 'text'→none).
            const method = effectiveNotificationMethod(request.notification_method, request.sms_consent);

            if (method) {
              // Quiet hours (both channels): suppress the send outside the fleet's local
              // 8 AM–9 PM. The change was still detected/charged above and is visible
              // in-app; a daytime material change re-triggers a fresh alert.
              const tz = usTimeZoneFromCoords(fleet?.home_lng, fleet?.home_lat);
              if (!isWithinNotifyWindow(new Date(), tz)) {
                console.log(`  🌙 Quiet hours (${tz}) — suppressing ${method} notification for "${request.request_name}"`);
              } else {
                const notifResult = await sendNotification(method, fleet.email, fleet.phone_number, subject, text, sms);
                notificationSent = notifResult.email?.success || notifResult.sms?.success;
              }
            }
          }
        } else {
          console.log('  ℹ️ No material change — free refresh, not charged, not logged as a search');
        }

        // Calculate next refresh time
        const intervalMinutes = request.auto_refresh_interval || 240;
        const nextRefreshAt = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();

        // Increment the refresh counter and self-disable once the cap is hit (item 006).
        const newCount = (request.auto_refresh_count || 0) + 1;
        const reachedLimit = request.max_auto_refreshes != null && newCount >= request.max_auto_refreshes;

        // Snapshot the current result set for next run's comparison (item #48).
        const snap = snapshotFromMatches(matches);

        // Update request with new match info and next refresh time
        const { error: updateError } = await supabase
          .from('backhaul_requests')
          .update({
            last_top_match_id: snap?.topId || null,
            last_top_match_revenue: topMatch?.totalRevenue || null,
            last_top_net: snap?.topNet ?? null,
            last_top25_avg_net: snap?.top25AvgNet ?? null,
            last_server_refresh_at: now,
            auto_refresh_count: newCount,
            // Stop scheduling once disabled so it drops out of the due-for-refresh query.
            auto_refresh: reachedLimit ? false : true,
            next_refresh_at: reachedLimit ? null : nextRefreshAt
          })
          .eq('id', request.id);

        if (updateError) {
          console.error(`  ❌ Failed to update request: ${updateError.message}`);
        }

        results.push({
          requestId: request.id,
          requestName: request.request_name,
          loadSource: connected ? 'truckstop_live' : 'static_fallback',
          loadsSearched: loadsForRequest.length,
          matchesFound: matches.length,
          topMatchId: topMatch?.load_id ?? null,
          material: !!change,
          charged,
          notificationSent,
          nextRefreshAt
        });

      } catch (requestError) {
        console.error(`  ❌ Error processing request ${request.id}:`, requestError.message);
        results.push({
          requestId: request.id,
          requestName: request.request_name,
          error: requestError.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Cron job completed in ${duration}ms`);

    return res.status(200).json({
      success: true,
      processed: results.length,
      duration: `${duration}ms`,
      results
    });

  } catch (error) {
    console.error('❌ Cron job failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

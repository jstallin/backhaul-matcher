/**
 * POST /api/cron/trimble-monthly-report
 *
 * Runs on the 1st of each month at 8am UTC.
 * Queries the previous month's hauled loads, generates an HTML report,
 * and emails it to all app admins via Resend.
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.VITE_APP_URL || 'https://haulmonitor.cloud';

function getBillingTier(billingStartDate, reportMonthStart) {
  if (!billingStartDate) return { perLoad: 0.10, minimum: 0, tier: null };
  const start = new Date(billingStartDate);
  const report = new Date(reportMonthStart);
  const monthsElapsed =
    (report.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (report.getUTCMonth() - start.getUTCMonth());
  if (monthsElapsed < 3) return { perLoad: 0.10, minimum: 0, tier: '1–3' };
  if (monthsElapsed < 6) return { perLoad: 0.10, minimum: 250, tier: '4–6' };
  return { perLoad: 0.10, minimum: 500, tier: '7+' };
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' CT';
}

function buildReportHtml({ monthLabel, loads, billing }) {
  const { perLoad, minimum, tier } = billing;
  const rawCost = loads.length * perLoad;
  const estimatedCost = Math.max(rawCost, minimum);

  const rows = loads.length > 0
    ? loads.map((l, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'}">
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px">${formatDateTime(l.completed_at)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;font-family:monospace">${l.hauled_load_id || '—'}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;text-transform:capitalize">${l.hauled_load_source || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px">No hauled loads recorded this month.</td></tr>`;

  const tierNote = tier
    ? `Month tier ${tier}: $${perLoad.toFixed(2)}/load${minimum > 0 ? `, $${minimum.toLocaleString()} minimum` : ''}`
    : `$${perLoad.toFixed(2)}/load`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haul Monitor — Trimble Actuals Report ${monthLabel}</title>
<style>
  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:700px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

    <!-- Header -->
    <div style="background:#1e40af;padding:32px 40px;display:flex;align-items:center;gap:20px">
      <img src="${APP_URL}/haul-monitor-logo.png" alt="Haul Monitor" style="height:48px;width:auto" />
      <div>
        <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.2">Trimble Actuals Report</div>
        <div style="color:#bfdbfe;font-size:14px;margin-top:4px">${monthLabel}</div>
      </div>
    </div>

    <!-- Summary bar -->
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

    <!-- Table -->
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

    <!-- Footer -->
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

export default async function handler(req, res) {
  // Verify cron secret
  const authHeader = req.headers['authorization'];
  const querySecret = req.query?.secret;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const headerMatch = authHeader === `Bearer ${cronSecret}`;
    const queryMatch = querySecret === cronSecret;
    if (!headerMatch && !queryMatch) {
      console.warn('[trimble-report] Unauthorized cron request');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Previous month date range
  const now = new Date();
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const monthLabel = prevMonthStart.toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'long', year: 'numeric',
  });

  // Fetch hauled loads for previous month (service role bypasses RLS)
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

  // Fetch billing start date from admin_settings
  const { data: bsSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'trimble_billing_start')
    .maybeSingle();
  const billingStartDate = bsSetting?.value?.date || null;

  const billing = getBillingTier(billingStartDate, prevMonthStart);
  const html = buildReportHtml({ monthLabel, loads: loads || [], billing });

  // Fetch all admin user emails
  const { data: adminRows } = await supabase
    .from('admin_users')
    .select('user_id');

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
  if (!resendKey) {
    console.error('[trimble-report] RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email not configured' });
  }

  const resend = new Resend(resendKey);
  const subject = `Haul Monitor — Trimble Actuals Report: ${monthLabel}`;

  let sent = 0;
  for (const email of adminEmails) {
    try {
      await resend.emails.send({
        from: 'Haul Monitor <notifications@haulmonitor.cloud>',
        to: [email],
        subject,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`[trimble-report] Failed to send to ${email}:`, err.message);
    }
  }

  console.log(`[trimble-report] Sent ${monthLabel} report (${loads.length} loads) to ${sent}/${adminEmails.length} admins`);
  return res.status(200).json({
    month: prevMonthStart.toISOString().slice(0, 7),
    loads: loads.length,
    sent,
    admins: adminEmails.length,
  });
}

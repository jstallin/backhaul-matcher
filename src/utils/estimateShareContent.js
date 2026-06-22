// #175: share-summary generator for an Estimate report (Email / Text / Copy).
// Unlike the load share (#82), this summarizes a whole estimate — opportunity
// count, highest/average net per load, and projected annual net — not one lane.
//
// Sizes:
//   compact — SMS-safe summary (headline figures only)
//   rich    — full summary for the Email body and Copy
//
// Context shape (built by the report): { estimate, fleet, metrics, annualVolume }
//   estimate — the estimate_requests row (request_name, datum_point, return_to_city/state, dates)
//   fleet    — fleet row or null (null = fleet-less estimate)
//   metrics  — output of computeMetrics(): { totalOpportunities, highestNet, averageAll, averageTop5 }
//   annualVolume — number (0 when not set)

const money = (v) => (v == null || Number.isNaN(Number(v)))
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    // Date-only strings parse as UTC midnight → previous day in US timezones; anchor to noon.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())
      ? new Date(`${dateStr}T12:00:00`)
      : new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

// "Home" line: fleet home when attached, else the estimate's Return To city/state.
const homeLine = (estimate, fleet) => {
  if (fleet?.home_address) return fleet.home_address;
  return [estimate?.return_to_city, estimate?.return_to_state].filter(Boolean).join(', ') || '—';
};

const pickupWindow = (estimate) => {
  const a = fmtDate(estimate?.equipment_available_date);
  const b = fmtDate(estimate?.equipment_needed_date);
  if (a && b) return `${a} – ${b}`;
  return a || b || '—';
};

export function buildEstimateSubject(senderName, estimate) {
  return `${senderName} shared a backhaul estimate: ${estimate?.request_name || 'Estimate'}`;
}

export function buildEstimateText({ estimate, fleet, metrics, annualVolume }, { size = 'rich' } = {}) {
  const opps = metrics?.totalOpportunities ?? 0;
  const highest = metrics?.highestNet?.netCredit;
  const avgAll = metrics?.averageAll?.netCredit;
  const avgTop5 = metrics?.averageTop5?.netCredit;
  const annualNet = metrics?.averageAll?.annualCredit;
  const vol = Number(annualVolume) || 0;

  if (size === 'compact') {
    const lines = [
      `Backhaul Estimate — ${estimate?.request_name || ''}`.trim(),
      `${opps} ${opps === 1 ? 'opportunity' : 'opportunities'} found.`,
      `Highest net/load ${money(highest)} · Avg net/load ${money(avgAll)}.`,
    ];
    if (vol > 0) lines.push(`Projected annual net ~${money(annualNet)}/yr (${vol} loads/yr).`);
    lines.push('via Haul Monitor');
    return lines.filter(Boolean).join('\n');
  }

  const lines = [
    `BACKHAUL ESTIMATE — ${estimate?.request_name || ''}`.trim(),
    '',
    `Fleet: ${fleet?.name || '—'}`,
    `Home: ${homeLine(estimate, fleet)}`,
    `Empty City, ST: ${estimate?.datum_point || '—'}`,
    `Pickup Window: ${pickupWindow(estimate)}`,
  ];
  if (vol > 0) lines.push(`Annual Volume: ${vol} loads/yr`);
  lines.push(
    '',
    `Opportunities found: ${opps}`,
    `Highest net / load: ${money(highest)}`,
    `Avg net / load (all): ${money(avgAll)}`,
    `Avg net / load (top 5): ${money(avgTop5)}`,
  );
  if (vol > 0) {
    lines.push('', `Projected annual net (avg all loads): ${money(annualNet)}/yr`);
  }
  lines.push('', '— Estimates only. Validate with your own mileage engine.', 'Shared via Haul Monitor');
  return lines.join('\n');
}

export function buildEstimateHtml({ estimate, fleet, metrics, annualVolume }, { note = '', senderName = '' } = {}) {
  const vol = Number(annualVolume) || 0;
  const row = (label, value, highlight = false) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${label}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:${highlight ? 800 : 600};color:${highlight ? '#16a34a' : '#0f172a'};text-align:right;">${value}</td>
    </tr>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    ${senderName ? `<p style="font-size:14px;color:#475569;margin:0 0 14px;">${esc(senderName)} shared a backhaul estimate with you.</p>` : ''}
    ${note ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;font-size:14px;color:#334155;margin:0 0 16px;white-space:pre-wrap;">${esc(note)}</div>` : ''}
    <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;">${esc(estimate?.request_name || 'Backhaul Estimate')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      ${row('Fleet', esc(fleet?.name || '—'))}
      ${row('Home', esc(homeLine(estimate, fleet)))}
      ${row('Empty City, ST', esc(estimate?.datum_point || '—'))}
      ${row('Pickup Window', esc(pickupWindow(estimate)))}
      ${vol > 0 ? row('Annual Volume', `${vol} loads/yr`) : ''}
    </table>
    <table style="width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      ${row('Opportunities found', String(metrics?.totalOpportunities ?? 0))}
      ${row('Highest net / load', money(metrics?.highestNet?.netCredit), true)}
      ${row('Avg net / load (all)', money(metrics?.averageAll?.netCredit))}
      ${row('Avg net / load (top 5)', money(metrics?.averageTop5?.netCredit))}
      ${vol > 0 ? row('Projected annual net (avg all)', `${money(metrics?.averageAll?.annualCredit)}/yr`, true) : ''}
    </table>
    <p style="font-size:12px;color:#94a3b8;margin:16px 0 0;">Estimates only. Validate with your own mileage engine. Shared via Haul Monitor.</p>
  </div>`;
}

/** Clipboard content for the Copy channel: the rich text summary. */
export function buildEstimateCopyText(ctx) {
  return buildEstimateText(ctx, { size: 'rich' });
}

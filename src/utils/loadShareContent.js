// Issue #82: shared load-summary generator for the Share feature (Email / Text / Copy).
// One source of truth so all three channels stay consistent across v1 and v2.
//
// Sizes:
//   compact — SMS-safe summary (no financial breakdown details)
//   rich    — full detail for Email body and Copy (Copy = rich minus the map)
//
// Works with the normalized match objects produced by routeHomeMatching.js —
// the same shape v1 (BackhaulResults) and v2 (SearchView) both consume.

const NOTE_MAX_EMAIL = 1000;
const NOTE_MAX_TEXT = 300;

// ── accessors (mirror SearchView's m* helpers — match objects carry both casings) ──
const mOriginAddr = (m) => m.origin?.address || `${m.pickup_city}, ${m.pickup_state}`;
const mDestAddr   = (m) => m.destination?.address || `${m.delivery_city}, ${m.delivery_state}`;
const mDistance   = (m) => m.distance ?? m.distance_miles ?? 0;
const mAdditional = (m) => m.additionalMiles ?? m.additional_miles ?? 0;
const mToPickup   = (m) => m.finalToPickup ?? m.final_to_pickup ?? 0;
const mRevPerMile = (m) => m.revenuePerMile ?? m.revenue_per_mile ?? 0;
const mTotalRev   = (m) => m.totalRevenue ?? m.total_revenue ?? 0;
const mPickupDate = (m) => m.pickupDate ?? m.pickup_date;
const mWeight     = (m) => m.weight ?? m.loadWeight;
const mLength     = (m) => m.trailerLength ?? m.trailer_length;
const mEquipType  = (m) => m.equipmentType ?? m.equipment_type;
const mFreight    = (m) => m.freightType ?? m.freight_type;

const money = (v) => (v == null || Number.isNaN(Number(v)))
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const money2 = (v) => (v == null || Number.isNaN(Number(v)))
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
const num = (v) => (v == null) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);

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

// Equipment line: "Dry Van · 42,000 lbs · 53 ft · General Freight" (skips missing parts)
const equipmentLine = (m) => [
  mEquipType(m),
  mWeight(m) ? `${num(mWeight(m))} lbs` : null,
  mLength(m) ? `${mLength(m)} ft` : null,
  mFreight(m),
].filter(Boolean).join(' · ');

export function buildShareSubject(senderName, match) {
  return `${senderName} shared a load with you: ${mOriginAddr(match)} → ${mDestAddr(match)}`;
}

// Plain-text summary. Used verbatim for SMS (compact) and Copy (rich);
// the email body is the HTML rendering of the same fields.
export function buildShareText(match, request, { size = 'rich' } = {}) {
  const lines = [];
  const pickup = fmtDate(mPickupDate(match));

  lines.push(`Load: ${mOriginAddr(match)} → ${mDestAddr(match)}`);
  if (pickup) lines.push(`Pickup: ${pickup}`);
  const equip = equipmentLine(match);
  if (equip) lines.push(equip);
  lines.push(`Load miles: ${num(mDistance(match))}`);
  lines.push(`Rate: ${money(mTotalRev(match))} (${money2(mRevPerMile(match))}/mi)`);

  if (size === 'compact') {
    // SMS: headline numbers + who to call, nothing else.
    if (match.has_rate_config && match.customer_net_credit != null) {
      lines.push(`Net credit: ${money(match.customer_net_credit)}`);
    }
    if (match.broker) lines.push(`Broker: ${match.broker}${match.contactPhone ? ` ${match.contactPhone}` : ''}`);
    return lines.join('\n');
  }

  // Rich: full detail mirroring the load detail dialog.
  lines.push('');
  lines.push('Route miles:');
  if (request?.datum_point) lines.push(`  ${request.datum_point} → pickup: ${num(mToPickup(match))} mi`);
  lines.push(`  Pickup → delivery: ${num(mDistance(match))} mi`);
  if (match.delivery_to_home_miles != null) lines.push(`  Delivery → home: ${num(match.delivery_to_home_miles)} mi`);
  lines.push(`  Extra miles vs. empty return: ${num(mAdditional(match))} mi`);

  if (match.has_rate_config) {
    lines.push('');
    lines.push('Financials:');
    lines.push(`  Gross revenue: ${money(mTotalRev(match))}`);
    if (match.customer_share != null) lines.push(`  Customer share: ${money(match.customer_share)}`);
    if (match.carrier_revenue != null) lines.push(`  Carrier revenue: ${money(match.carrier_revenue)}`);
    if (match.mileage_expense != null) lines.push(`  Mileage expense: -${money(match.mileage_expense)}`);
    if (match.stop_expense != null) lines.push(`  Stop expense (${match.stop_count ?? 0}): -${money(match.stop_expense)}`);
    if (match.fuel_surcharge != null) lines.push(`  Fuel surcharge: -${money(match.fuel_surcharge)}`);
    if (match.other_charges != null && match.other_charges > 0) lines.push(`  Other charges: -${money(match.other_charges)}`);
    if (match.customer_net_credit != null) lines.push(`  Net credit: ${money(match.customer_net_credit)}`);
  }

  const contact = [];
  if (match.broker) contact.push(`Broker: ${match.broker}`);
  if (match.contactName) contact.push(`Contact: ${match.contactName}`);
  if (match.contactPhone) contact.push(`Phone: ${match.contactPhone}`);
  if (match.companyEmail) contact.push(`Email: ${match.companyEmail}`);
  if (contact.length) {
    lines.push('');
    lines.push(...contact);
  }

  lines.push('');
  lines.push('Shared via Haul Monitor — haulmonitor.cloud');
  return lines.join('\n');
}

// Email body HTML: note on top, full details, optional inline route map (cid).
export function buildShareHtml(match, request, { note = '', senderName = '', mapCid = null } = {}) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (label, value) => value == null || value === '' || value === '—'
    ? ''
    : `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;">${esc(label)}</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${esc(value)}</td></tr>`;

  const finRows = !match.has_rate_config ? '' : [
    row('Gross revenue', money(mTotalRev(match))),
    row('Customer share', match.customer_share != null ? money(match.customer_share) : null),
    row('Carrier revenue', match.carrier_revenue != null ? money(match.carrier_revenue) : null),
    row('Mileage expense', match.mileage_expense != null ? `-${money(match.mileage_expense)}` : null),
    row(`Stop expense (${match.stop_count ?? 0})`, match.stop_expense != null ? `-${money(match.stop_expense)}` : null),
    row('Fuel surcharge', match.fuel_surcharge != null ? `-${money(match.fuel_surcharge)}` : null),
    row('Other charges', match.other_charges > 0 ? `-${money(match.other_charges)}` : null),
    row('Net credit', match.customer_net_credit != null ? money(match.customer_net_credit) : null),
  ].join('');

  const contactRows = [
    row('Broker', match.broker),
    row('Contact', match.contactName),
    row('Phone', match.contactPhone),
    row('Email', match.companyEmail),
  ].join('');

  const section = (title, rows) => !rows ? '' : `
    <div style="margin-top:20px;">
      <div style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${esc(title)}</div>
      <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
    </div>`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
      ${note ? `<div style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e3a8a;font-size:14px;white-space:pre-wrap;margin-bottom:20px;">${esc(note)}</div>` : ''}
      <div style="font-size:13px;color:#64748b;margin-bottom:4px;">${esc(senderName)} shared a load with you</div>
      <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:2px;">${esc(mOriginAddr(match))} &rarr; ${esc(mDestAddr(match))}</div>
      <div style="font-size:13px;color:#64748b;">${esc(equipmentLine(match))}</div>
      ${mapCid ? `<img src="cid:${mapCid}" alt="Route map" style="width:100%;border-radius:8px;border:1px solid #e2e8f0;margin-top:16px;" />` : ''}
      ${section('Load', [
        row('Pickup date', fmtDate(mPickupDate(match))),
        row('Load miles', `${num(mDistance(match))} mi`),
        row('Rate', `${money(mTotalRev(match))} (${money2(mRevPerMile(match))}/mi)`),
        row(request?.datum_point ? `${request.datum_point} → pickup` : null, request?.datum_point ? `${num(mToPickup(match))} mi` : null),
        row('Delivery → home', match.delivery_to_home_miles != null ? `${num(match.delivery_to_home_miles)} mi` : null),
        row('Extra miles vs. empty return', `${num(mAdditional(match))} mi`),
      ].join(''))}
      ${section('Financials', finRows)}
      ${section('Broker / Contact', contactRows)}
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
        Shared via <a href="https://www.haulmonitor.cloud" style="color:#2563eb;text-decoration:none;">Haul Monitor</a> · Estimates only — validate with your specific mileage engines.
      </div>
    </div>
  </div>
</body></html>`;
}

// Map stops for the email's static route map: datum → pickup → delivery → home.
// Coords may be null (Truckstop SOAP loads) — the server passes city/state addresses
// to PC*MILER, which geocodes them.
export function buildShareMapStops(match, request, fleetHome) {
  const stops = [];
  if (request?.datum_point) stops.push({ address: request.datum_point, lat: request.datum_lat ?? null, lng: request.datum_lng ?? null });
  stops.push({ address: mOriginAddr(match), lat: match.origin?.lat ?? null, lng: match.origin?.lng ?? null });
  stops.push({ address: mDestAddr(match), lat: match.destination?.lat ?? null, lng: match.destination?.lng ?? null });
  if (fleetHome?.address) stops.push({ address: fleetHome.address, lat: fleetHome.lat ?? null, lng: fleetHome.lng ?? null });
  return stops;
}

export { NOTE_MAX_EMAIL, NOTE_MAX_TEXT };

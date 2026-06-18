// #163: map a live in-memory match/load object to a saved_loads DB row.
// The match object uses camelCase + nested origin/destination; saved_loads uses snake_case
// columns (modeled on imported_loads). Keep this pure so it's unit-testable and shared by
// both v1 and v2 save paths.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};
// Date-only string passthrough ('YYYY-MM-DD'); null for anything unusable.
const dateOnly = (v) => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// Stable identity for a load across save/membership checks: "<source>::<load_id>".
export const savedKeyOf = (m) => {
  if (!m) return null;
  const id = m.load_id ?? m.source_load_id ?? null;
  const source = m.source ?? 'unknown';
  return id != null ? `${source}::${id}` : null;
};

export function buildSavedLoadRow(match, { userId, requestId = null, fleetId = null } = {}) {
  if (!match || !userId) return null;
  const o = match.origin || {};
  const d = match.destination || {};

  return {
    user_id: userId,
    request_id: requestId,
    fleet_id: fleetId,
    load_id: String(match.load_id ?? match.source_load_id ?? ''),
    source: match.source ?? 'unknown',

    origin_city: o.city ?? match.pickup_city ?? null,
    origin_state: o.state ?? match.pickup_state ?? null,
    origin_lat: num(o.lat ?? match.pickup_lat),
    origin_lng: num(o.lng ?? match.pickup_lng),
    destination_city: d.city ?? match.delivery_city ?? null,
    destination_state: d.state ?? match.delivery_state ?? null,
    destination_lat: num(d.lat ?? match.delivery_lat),
    destination_lng: num(d.lng ?? match.delivery_lng),

    pickup_date: dateOnly(match.pickupDate ?? match.pickup_date),
    delivery_date: dateOnly(match.deliveryDate ?? match.delivery_date),
    distance_miles: int(match.distance ?? match.pickup_to_delivery_miles ?? match.distance_miles),
    out_of_route_miles: int(match.additionalMiles ?? match.additional_miles),
    revenue_amount: num(match.totalRevenue ?? match.total_revenue),
    net_revenue: num(match.customer_net_credit ?? match.netRevenue ?? match.net_revenue),
    equipment_type: match.equipmentType ?? match.equipment_type ?? null,
    weight_lbs: int(match.weight ?? match.weight_lbs),
    length_ft: int(match.trailerLength ?? match.trailer_length),

    company_name: match.broker ?? match.company_name ?? null,
    shipper: match.shipper ?? null,
    freight_type: match.freightType ?? match.freight_type ?? null,
    contact_phone: match.contactPhone ?? match.phone ?? null,
    contact_email: match.companyEmail ?? match.company_email ?? null,

    raw_data: match,
    status: 'saved',
  };
}

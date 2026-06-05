// Issue #84: snapshot the displayed top match's derived dollar figures when a
// request is cancelled as OPERATIONS DECLINED. Zero-copy: we persist OUR computed
// metrics, never the third-party load row. Returns {} when there's nothing to
// snapshot (no matches displayed at decline time — tile skips that request).
export const OPERATIONS_DECLINED = 'operations_declined';

export function buildDeclineSnapshot(reason, topMatch) {
  if (reason !== OPERATIONS_DECLINED || !topMatch) return {};

  // NaN is not caught by ??, so coerce explicitly (same guard as the haul flow).
  const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const origin = topMatch.origin?.address || [topMatch.pickup_city, topMatch.pickup_state].filter(Boolean).join(', ');
  const dest = topMatch.destination?.address || [topMatch.delivery_city, topMatch.delivery_state].filter(Boolean).join(', ');

  return {
    declined_top_gross_revenue: safeNum(topMatch.totalRevenue ?? topMatch.total_revenue),
    // Nets require the fleet's rate config — null without it ('—' in the tile).
    declined_top_customer_net: topMatch.has_rate_config ? safeNum(topMatch.customer_net_credit) : null,
    declined_top_carrier_net: topMatch.has_rate_config ? safeNum(topMatch.carrier_revenue) : null,
    declined_top_load_summary: origin && dest ? `${origin} → ${dest}` : null,
  };
}

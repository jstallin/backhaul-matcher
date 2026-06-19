// Item #48 Part 1 — unified "is this change worth notifying about?" detector.
// Used by BOTH the server cron (api/cron/refresh-requests.js) and client polling
// (notificationService.js) so the two paths agree on what's material.
//
// Value model (per pilot framing): notifications must be worth paying a refresh for.
//   - Improvement: a new #1 load, or the top load's NET revenue rising >= threshold%.
//   - Lane softening: the AVERAGE net of the top 25 dropping >= threshold% overall
//     (a market-cooling signal — we deliberately do NOT alert on individual top-load
//     decreases, which would just be noise that gets auto-refresh turned off).
// Net revenue is the metric (what the customer actually keeps), not gross.

// Tunable: percent change that counts as material. Start at 5%; easy to dial down
// once the test harness + live data show whether it fires often enough.
export const NOTIFY_NET_THRESHOLD_PCT = 5;

// Loads compared by net revenue, with graceful fallback to gross when a fleet has
// no rate config (net uncomputable) so detection still degrades sensibly.
export const netOf = (m) =>
  Number(m?.customer_net_credit ?? m?.netRevenue ?? m?.net_revenue ?? m?.totalRevenue ?? m?.total_revenue ?? 0);

export const idOf = (m) => m?.load_id ?? m?.id ?? null;

// A comparable snapshot of a ranked matches array (matches are pre-sorted best-first).
export function snapshotFromMatches(matches = []) {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const top25 = matches.slice(0, 25);
  const avgNet = top25.reduce((sum, m) => sum + netOf(m), 0) / top25.length;
  return {
    topId: idOf(matches[0]),
    topNet: netOf(matches[0]),
    top25AvgNet: avgNet,
    count: top25.length,
  };
}

const pctChange = (from, to) => (from > 0 ? ((to - from) / Math.abs(from)) * 100 : 0);

/**
 * Compare a previous snapshot to the new matches.
 * @param {object|null} prev - { topId, topNet, top25AvgNet } from the last run (null = first run)
 * @param {Array} newMatches - current ranked matches
 * @returns {object|null} change descriptor, or null when nothing material changed
 *   { type: 'new_top'|'top_net_up'|'lane_softening', match?, newNet?, avgNet?, pct? }
 */
export function detectNotifiableChange(prev, newMatches, thresholdPct = NOTIFY_NET_THRESHOLD_PCT) {
  const next = snapshotFromMatches(newMatches);
  if (!next) return null;                      // nothing to compare against now
  if (!prev || prev.topId == null) return null; // first run — establish a baseline silently

  const top = newMatches[0];

  // Don't alert on a top load that isn't profitable. A "call for rate" / no-posted-rate load
  // has gross 0, so its net is 0 − out-of-route costs (always ≤ 0); a genuinely negative net
  // is likewise not worth notifying about. net > 0 cleanly covers both. The baseline still
  // advances (caller records this topId), so a later profitable #1 re-triggers normally.
  const topNetWorthAlerting = next.topNet > 0;

  // 1) New #1 load — by definition the new best (matches are net-ranked).
  if (prev.topId !== next.topId) {
    return topNetWorthAlerting ? { type: 'new_top', match: top, newNet: next.topNet } : null;
  }

  // 2) Same top load, net improved >= threshold%.
  const topPct = pctChange(prev.topNet, next.topNet);
  if (topPct >= thresholdPct) {
    return topNetWorthAlerting ? { type: 'top_net_up', match: top, newNet: next.topNet, pct: topPct } : null;
  }

  // 3) Lane softening — avg net of the top 25 dropped >= threshold% overall.
  const avgPct = pctChange(prev.top25AvgNet, next.top25AvgNet);
  if (avgPct <= -thresholdPct) {
    return { type: 'lane_softening', avgNet: next.top25AvgNet, pct: avgPct };
  }

  return null;
}

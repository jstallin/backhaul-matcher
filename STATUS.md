# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** May 26, 2026
- **Session type:** Claude Code (build + debug)
- **Updated by:** Claude Code

---

## Roadmap Status

| # | Item | Status |
|---|------|--------|
| 1 | Claude sync (Claude.ai ↔ Claude Code) | ✅ Done |
| 2 | Staging environment | ✅ Done |
| 3 | Test suite expansion | ✅ Done (initial pass) |
| 4 | Work Week Planning (dedicated fleet feature) | ✅ Shipped to production — see details below |
| 5 | Claude efficiency / multi-agent | ✅ Done — STATUS.md workflow established |
| 6 | Infrastructure paid tiers | ⏳ Blocked — awaiting corporate card |

---

## What Was Just Completed (May 26, 2026)

### Work Week Planning — Production
All of the following shipped to production via staging → PR → merge:

**Algorithm fixes (was returning 0 results):**
- State centroid pre-screening: Truckstop loads have no coordinates, so all null-coord loads were passing the Haversine filter and filling the 20-candidate cap with loads delivering to IL/MN/TX. Now uses US state centroids (2.5x radius buffer) to screen out clearly-far states before PC*MILER is called.
- Removed per-leg `minTotalMiles: 500` filter that was rejecting valid short regional returns (e.g. Charlotte→Davidson at 200mi total leg). Minimum is now only enforced at the full chain level.
- Outbound delivery radius display: falls back to state centroid when load has no delivery coordinates (was showing "0 mi / 1,000 mi").
- Filters out outbounds where `distance_miles = 0` (bogus Truckstop data).

**Route maps on chain cards:**
- Top match card: 200px map, eager-loaded immediately on results render.
- All other cards: 150px, lazy-loaded via IntersectionObserver when card scrolls into view.
- Nominatim geocodes stops that lack coordinates (Truckstop loads); results cached in a module-level Map — repeated lookups within the same session are instant.
- New file: `src/components/v2/ChainRouteMap.jsx`

**5-credit cost per run (v1 + v2):**
- `api/stripe/index.js`: deduct endpoint now accepts an optional `amount` in request body (was hardcoded to 1).
- `src/hooks/useCredits.js`: `deductCredit()` accepts an `amount` param (default 1).
- v2 `WorkWeekView`: deducts 5 credits on run, shows gold coin badge on button, "5 credits per run" strip below button, red banner on insufficient credits.
- v1 `WorkWeekPlanning`: same credit badge, cost strip, and banner.

**Other fixes in this session:**
- Fleet home not updating in DB when edited in FleetSetup (broken address parsing on form init).
- Geocode.js failing for addresses without commas (e.g. "12524 Robert Walker Dr Davidson NC") — was returning "Davidson County, NC" instead of "Davidson, NC".
- Work Week Planning nav item visible to non-admin users in v2 Sidebar — now gated by `isAdmin`.
- Gallons conserved formula wrong in 4 places — fixed to `Math.max(0, loadMiles - oorMiles) / mpg`.
- Truckstop loads now show Waypoint icon instead of text badge; "View on Truckstop" link removed from LoadMiniCard.
- Debug `[WWP]` console.log statements left in algorithm intentionally for now — useful while Chip tests.

**Unit tests:**
- 30/30 algorithm tests passing. Two tests updated to reflect state-centroid pre-screening behavior (outbound load correctly evaluated as return candidate when delivery is within 150mi of home).

---

## In Progress / Next Up
- **Waiting on Chip's feedback** on Work Week Planning results quality — algorithm is now finding plans, Chip validating route logic and revenue numbers.
- **WWP user experience for plan lifecycle** — selecting a plan, tracking progress, closing out when complete. To be designed with Chip before building.
- **Truckstop datum issue in production** — some fleets have a stale/unparseable `home_address` in DB causing datum city/state to be empty, which causes Truckstop to skip the search and fall back to DirectFreight. Fix: re-verify the address in Fleet Setup to overwrite with a clean `home_address`.
- Corporate card arriving soon — upgrade Supabase + Vercel to paid tiers before pilots scale.

---

## Key Decisions Made This Session
- Work Week Planning costs 5 credits per run (not 1 like search/estimate).
- Return load delivery radius strictly enforced at 150mi (PC*MILER driving distance, not just Haversine).
- Minimum miles (500) applies to the full chain, not individual legs.
- State centroid threshold: 2.5× homeRadius (~375mi for 150mi radius) — lets TN/KY/VA pass while IL/MN/TX fail.
- Route maps use OSM tiles (not PC*MILER tiles) — simpler, no auth needed for display-only maps.
- Both v1 and v2 must always be kept in sync on shared features.

---

## Open Questions / Blockers
- Corporate card for Supabase Pro + Vercel Pro upgrades.
- Authenticated Playwright tests need proper auth flow implementation.
- Truckstop credentials stored in plaintext in `user_integrations.metadata` — must encrypt before real carrier credentials go in (pre-production blocker).
- WWP plan lifecycle UX (progress tracking, close-out) — design pending Chip input.

---

## Pilots
- 1–2 pilot customers active or starting imminently (May/June 2026).
- First pilot has valid Truckstop integration ID.
- Production stability is top priority during pilot period.

---

## Quick Reference — Key URLs
- Production: `https://haulmonitor.cloud/app`
- Staging: `https://staging.haulmonitor.cloud/app`
- Repo: `https://github.com/jstallin/backhaul-matcher`
- Staging Supabase: `https://vdrkpitooqgmmlfrbphi.supabase.co`

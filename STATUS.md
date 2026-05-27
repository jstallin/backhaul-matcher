# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** May 27, 2026
- **Session type:** Claude Code (build + debug)
- **Updated by:** Claude Code

---

## Roadmap Status

| # | Item | Status |
|---|------|--------|
| 1 | Claude sync (Claude.ai ↔ Claude Code) | ✅ Done |
| 2 | Staging environment | ✅ Done |
| 3 | Test suite expansion | ✅ Done (initial pass) |
| 4 | Work Week Planning (dedicated fleet feature) | ✅ Shipped — plan lifecycle complete, pending Chip feedback on quality |
| 5 | Claude efficiency / multi-agent | ✅ Done — STATUS.md workflow established |
| 6 | Infrastructure paid tiers | ⏳ Blocked — awaiting corporate card |

---

## What Was Just Completed (May 27, 2026)

### WWP Plan Lifecycle — Production
All of the following shipped to production via staging → PR → merge:

**Plan detail modal (`PlanDetailModal.jsx`):**
- Slide-in panel (560px desktop, full-screen mobile) accessible from both the dashboard widget and the WorkWeekView active plan banner.
- Shows full chain summary (route, revenue, miles, rev/mi, deadline).
- Per-load status controls for return load and outbound load independently.
- Load statuses: `pending` → `booked` → `hauled` (with undo at each step).
- Plan status auto-advances: any load booked/hauled → `in_progress`; all loads hauled → `completed` (panel closes, widget disappears).
- Broker name, shipper, Call and Text buttons displayed per load in the modal.

**Broker contact info on chain cards:**
- `LoadMiniCard` in WWP results now shows broker name, shipper, and Call/Text buttons — same contact experience as backhaul search results.

**Dashboard widget behavior:**
- Clicking an active plan widget opens `PlanDetailModal` directly instead of navigating to the work-week view.
- Widget reflects live plan status (active / in progress / completed).

**Schema additions (`work_week_plans`):**
- `outbound_status TEXT DEFAULT 'pending'`
- `return_status TEXT DEFAULT 'pending'`
- `getActive` now returns both `active` and `in_progress` plans.
- New `updateLoadStatus(planId, loadKey, loadStatus)` DB helper auto-computes plan status.

**Other fixes this session:**
- "Confirm Haul" 400 error fixed in v1 + v2: NaN guard (`Number.isFinite`) on all numeric fields before Supabase write; improved error logging to show `err.message` + `err.details`.
- Net revenue on dashboard stat cards rounded to whole dollars (was showing e.g. `$284.764`).
- Migration history reconciled: local file timestamps now match what production's `schema_migrations` table recorded. Staging schemas brought in sync (added `is_pilot`, pilot dates, `excluded_from_billing`). Prevents "Remote migration versions not found" CI error on future PRs.

---

## What Was Completed (May 26, 2026)

### Work Week Planning — Production

**Algorithm fixes (was returning 0 results):**
- State centroid pre-screening: Truckstop loads have no coordinates, so all null-coord loads were passing the Haversine filter and filling the 20-candidate cap with loads delivering to IL/MN/TX. Now uses US state centroids (2.5x radius buffer) to screen out clearly-far states before PC*MILER is called.
- Removed per-leg `minTotalMiles: 500` filter that was rejecting valid short regional returns (e.g. Charlotte→Davidson at 200mi total leg). Minimum is now only enforced at the full chain level.
- Outbound delivery radius display: falls back to state centroid when load has no delivery coordinates (was showing "0 mi / 1,000 mi").
- Filters out outbounds where `distance_miles = 0` (bogus Truckstop data).

**Route maps on chain cards:**
- Top match card: 200px map, eager-loaded immediately on results render.
- All other cards: 150px, lazy-loaded via IntersectionObserver when card scrolls into view.
- Nominatim geocodes stops that lack coordinates (Truckstop loads); results cached in a module-level Map.
- New file: `src/components/v2/ChainRouteMap.jsx`

**5-credit cost per run (v1 + v2):**
- `api/stripe/index.js`: deduct endpoint accepts optional `amount` in request body.
- `src/hooks/useCredits.js`: `deductCredit()` accepts an `amount` param (default 1).
- v2 `WorkWeekView` + v1 `WorkWeekPlanning`: gold coin badge, "5 credits per run" strip, insufficient credits banner.

---

## In Progress / Next Up
- **Waiting on Chip's feedback** on Work Week Planning results quality — algorithm is finding plans, Chip validating route logic and revenue numbers.
- **WWP plan lifecycle UX refinement** — pending Chip input on what additional detail or workflow changes are needed after he tests.
- **Remove `[WWP]` debug logging** from algorithm once Chip validates results.
- **Truckstop datum issue in production** — some fleets have a stale/unparseable `home_address` in DB causing datum city/state to be empty, which causes Truckstop to skip the search and fall back to DirectFreight. Fix: re-verify the address in Fleet Setup to overwrite with a clean `home_address`.
- Corporate card arriving soon — upgrade Supabase + Vercel to paid tiers before pilots scale.

---

## Key Decisions Made
- Work Week Planning costs 5 credits per run (not 1 like search/estimate).
- Return load delivery radius strictly enforced at 150mi (PC*MILER driving distance, not just Haversine).
- Minimum miles (500) applies to the full chain, not individual legs.
- State centroid threshold: 2.5× homeRadius (~375mi for 150mi radius) — lets TN/KY/VA pass while IL/MN/TX fail.
- Route maps use OSM tiles (not PC*MILER tiles) — simpler, no auth needed for display-only maps.
- Load statuses: `pending` → `booked` → `hauled`. Plan statuses: `active` → `in_progress` → `completed`.
- 3-load chains: connector load not tracked separately — outbound + return status only.
- Both v1 and v2 must always be kept in sync on shared features.

---

## Open Questions / Blockers
- Corporate card for Supabase Pro + Vercel Pro upgrades.
- Authenticated Playwright tests need proper auth flow implementation.
- Truckstop credentials stored in plaintext in `user_integrations.metadata` — must encrypt before real carrier credentials go in (pre-production blocker).
- WWP algorithm quality — pending Chip validation of route logic and revenue numbers.

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

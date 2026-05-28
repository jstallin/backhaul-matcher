# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** May 27, 2026
- **Session type:** Claude Code (build + debug)
- **Updated by:** Claude Code (session 4)

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

## What Was Just Completed (May 27, 2026, session 4)

### Estimate Truckstop fix + v2 fleet form parity — all shipped to production

**Estimates now hit Truckstop (v1 + v2):**
- Root cause: both estimate components passed `datumState: ''` to `getLoadsForMatching`, causing `fetchTruckstopLoads` to bail out immediately ("no usable city/state") and fall through to scraped DirectFreight data.
- Fix: split `datum_point` ("City, ST") on comma to get separate city and state — same pattern searches have always used. Also pass lat/lng coords. Applied to both `OpenEstimateRequests.jsx` (v1) and `EstimatesView.jsx` (v2).

**v1 estimate aligned with v2:**
- `OpenEstimateRequests` was not passing `requestContext` to `getLoadsForMatching` at all, so Truckstop was never attempted — it fell back to demo/imported data, found matches, then showed spurious "Fleet rate config not set" warning.
- Fix: pass `requestContext` (mirrors v2 behavior).
- Added `matches.length > 0` guard on the rate config warning — now only shows when there are actual matches but no config (matches v2).
- Added "No matching opportunities found" empty state to `EstimateResults.jsx` when 0 results (matches v2 messaging).

**v2 fleet form parity with v1:**
- Added Equipment Variation dropdown (Conestoga, Tanker, Curtain Side, Extendable, Lowboy).
- Added DOE PADD Rate input — was in form state and `buildFleetPayload` but never rendered in JSX.
- Added Customer % read-only display (auto-complement to Carrier %).
- Added FSC Preview live calculation: (DOE Rate − PEG) / MPG, appears when all three fields are filled.
- Split Fuel Surcharge into its own labeled section with formula visible.
- Fixed Carrier % default from 70 → 20 (matches v1 and algorithm fallback).
- `buildFleetPayload` now saves `equipment_variation`.

---

## What Was Just Completed (May 27, 2026, session 3)

### Truckstop API upgrade + load card enrichment — all shipped to production

**Switched to `GetMultipleLoadDetailResults` endpoint:**
- Richer data than old `GetLoadSearchResults` — captures 10+ additional fields.
- Single SOAP call returns all results (`PageNumber: 0`) — eliminated 5-page parallel fetch.
- Removed invalid `DestinationState` multi-state filter (API only accepts single state; was silently breaking all searches). Corridor algorithm handles destination filtering.
- Fixed non-auth SOAP errors being thrown as `UNAUTHORIZED` — was causing WWP searches to fail with "credentials invalid" console error.

**New fields surfaced on load cards (v1 + v2):**
- **Broker Credit** (CreditStop rating) — compact broker row + expanded detail grid.
- **Broker Email** — "Email" button in contact row; full mailto link in expanded detail.
- **Appointment times** — pickup and delivery dates now include time when available (e.g. "5/27 · 7:00 PM").
- **Special Instructions** (SpecInfo) — displayed when present, italic, full-width in expanded detail.
- All new fields wired through `routeHomeMatching.js` so they flow to all consumers (v1, v2, WWP cards).

**Truckstop field audit (CSV):**
- Reviewed all 53 fields in `MultipleLoadDetailResult` against actual app usage.
- Updated CSV with accurate "App Status" column (Displayed / Captured-not-shown / Not captured / Skipped).
- Delivered to Jason for Chip review. Key action items: Credit rating, Email, appointment times, SpecInfo — all now done.

**WWP hauled loads in dashboard + Trimble actuals:**
- `db.workWeekPlans.getHauled()` helper added.
- Dashboard (v1 + v2): Completed Hauls count and Net Revenue now include WWP outbound + return loads individually.
- Trimble actuals report: WWP hauled loads appear as separate rows ("Work Week Plan — Outbound/Return"), labeled by type.
- `excluded_from_billing` column added to `work_week_plans` (migration applied to staging + production).
- Exclude/Restore toggle works for WWP rows — plan-level exclusion (both outbound + return flip together).

**Trimble actuals exclude persistence bug fixed:**
- PATCH requests had no `Authorization` header — API was silently returning 401.
- Optimistic UI update made it appear to work. Affected both BH and WWP excludes since the feature was built.
- Fixed: added `Authorization: Bearer ${session.access_token}` to PATCH fetch; added PATCH to `Access-Control-Allow-Methods`.
- Billable count now derived live from loads array (not stale API `count`), updates instantly on toggle.

---

## What Was Completed (May 27, 2026, session 2)

### Bug fixes and polish — all shipped to production

**Crisp live chat integration (disabled for now):**
- `CrispChat.jsx` built and wired into v1 + v2 — loads Crisp, identifies user by email, hidden for admins.
- "Get Help Live" button added to `HelpView.jsx` (Help & Support page), green, opens Crisp chat.
- Disabled by default (commented out) pending Chip sign-off. Easy 3-line uncomment to re-enable.
- Decision: no floating launcher — Crisp opens only via the Help page button.

**Backhaul request results map — numbered load markers restored (v2):**
- Markers were missing for Truckstop loads (which have no coordinates) after a prior fix stored `null` coords on match objects.
- `RouteHomeMap` now falls back to state centroids for display when exact coords are null.
- `STATE_CENTROIDS` exported from `routeHomeMatching.js` for reuse.
- Some markers may appear outside the corridor blob (state centroid ≠ exact city) — accepted tradeoff vs. empty map.

**v1 request list count/empty state fix:**
- Count in "Your Backhaul Requests (N)" was using `requests.length` (all statuses including completed), but cards only rendered active/paused — causing misleading "(1) with no cards" display.
- Now filters first, counts what's shown, and shows empty state when nothing is displayable.

**Truckstop integration ID encryption — deferred:**
- Clarified: only the per-org **integration ID** is stored in `user_integrations.metadata` (not username/password — those are Haul Monitor's own env vars).
- Encryption deferred to Supabase Vault after Pro upgrade. Accepted risk for pilot phase.

---

## What Was Completed (May 27, 2026, session 1)

### WWP Plan Lifecycle — Production

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

**Other fixes:**
- "Confirm Haul" 400 error fixed in v1 + v2: NaN guard (`Number.isFinite`) on all numeric fields before Supabase write.
- Net revenue on dashboard stat cards rounded to whole dollars.
- Migration history reconciled; prevents "Remote migration versions not found" CI error.

---

## What Was Completed (May 26, 2026)

### Work Week Planning — Production

**Algorithm fixes (was returning 0 results):**
- State centroid pre-screening for Truckstop loads (no coordinates).
- Removed per-leg `minTotalMiles: 500` filter.
- Outbound delivery radius display falls back to state centroid.
- Filters out outbounds where `distance_miles = 0`.

**Route maps on chain cards:** OSM tiles, lazy-loaded via IntersectionObserver.

**5-credit cost per run (v1 + v2).**

---

## In Progress / Next Up
- **Waiting on Chip's feedback** on Work Week Planning results quality + new load card fields (credit, email, appt times, special instructions).
- **Remove `[WWP]` debug logging** from algorithm once Chip validates.
- **Crisp chat** — uncomment `CrispChat` in App.jsx + AppV2.jsx and the button in HelpView.jsx when ready to launch.
- **Zip-code geocoding** — `pickup_zip` and `delivery_zip` are now captured; could replace state-centroid map markers with more accurate positions.
- **Corporate card** → Supabase Pro + Vercel Pro upgrades → Supabase Vault for integration ID encryption.

---

## Key Decisions Made
- Work Week Planning costs 5 credits per run (not 1 like search/estimate).
- Return load delivery radius strictly enforced at 150mi (PC*MILER driving distance).
- Minimum miles (500) applies to the full chain, not individual legs.
- State centroid threshold: 2.5× homeRadius — lets TN/KY/VA pass while IL/MN/TX fail.
- Route maps use OSM tiles (not PC*MILER tiles).
- Load statuses: `pending` → `booked` → `hauled`. Plan statuses: `active` → `in_progress` → `completed`.
- 3-load chains: connector load not tracked separately — outbound + return status only.
- Both v1 and v2 must always be kept in sync on shared features.
- Truckstop username/password are Haul Monitor env vars (not per-org). Only the org's **integration ID** is stored in the DB.
- Crisp live chat: no floating launcher — opens only via Help & Support page button.
- Truckstop `DestinationState` filter dropped — API only accepts a single state; corridor algorithm handles destination filtering.
- WWP Trimble billing: plan-level exclusion (outbound + return excluded together, not individually).
- No "Book This Load" button on Truckstop — their platform is also lookup-only. Haul Monitor value = smarter filter + net revenue calc + all broker data in one place.

---

## Open Questions / Blockers
- Corporate card for Supabase Pro + Vercel Pro upgrades.
- Authenticated Playwright tests need proper auth flow implementation.
- Truckstop integration ID stored in plaintext — encrypt via Supabase Vault after Pro upgrade (accepted risk for pilot).
- WWP algorithm quality — pending Chip validation.

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

# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** May 30, 2026
- **Session type:** Claude Code (Ryder pilot kickoff follow-ups)
- **Updated by:** Claude Code (session 6)

---

## What Was Just Completed (May 30, 2026, session 6) — staging-test follow-up fixes

Continued smoke-testing batch 2 on staging. 001, 003, 004, 005 all verified good. Two bugs found and fixed; pushed to staging.

- **002 (FIX — stale typo error):** The "We couldn't find that location — check the spelling." warning stayed visible even after a later verify succeeded (v2 also showed the green "✓ Location verified" line at the same time). Cause: the parent set the error in `validate()` but never cleared it when `onResolve` later returned valid coords. Fix: clear the datum error on successful resolve in both v2 `SearchView` (`handleDatumResolve`) and v1 `StartRequest` (`onResolve`). The earlier 13th-function Vercel build bug from 002 was already fixed in commit `04b9b3a` (suggest merged into `geocode.js?suggest=1`).
- **009-P2 (FIX — WWP mobile):** On mobile, the X to close the Work Week Plan detail popup was covered by the avatar/user menu. Cause: `PlanDetailModal` rendered at `zIndex: 1000`, below the avatar button (`Shell.jsx` zIndex 1100) and its popover (1200). Fix: bumped the modal to `zIndex: 2000`, matching every other full-screen v2 modal. v2-only (no v1 WWP plan modal).

All 154 unit tests pass. Still on `staging`, not yet promoted to main.

---

## What Was Just Completed (May 30, 2026, session 5) — Ryder pilot kickoff items

Great Ryder kickoff (ran an hour over, they're excited to start). Items 001–008 captured; 007/008 held for Chip. Built and tested 001, 003, 004, 005, 002.

**Batch 1 — shipped to staging (commit 66d1018):**
- **001 (FIX):** v2 fleet delete — added delete-fleet to `FleetsView` ProfileTab (confirm dialog → `db.fleets.delete` → clears selection/reloads). Parity with v1.
- **003 (ENHANCE):** auto-refresh now forces notifications on + locks the toggle (v1 `StartRequest`, v2 `SearchView`); enforced in `buildRequestPayload` + v1 save payload.
- **004 (FIX):** hard ±1-day pickup-date window in `findRouteHomeBackhauls` (drops out-of-window loads before PC*MILER calls); survivors carry `date_fit`, rendered as a ▲ +1 / ▼ −1 day badge on cards (v1 + v2). Requested date threaded from `equipment_available_date`.
- Fixed stale `buildFleetPayload` test (carrier split default 20, 80/20 customer/carrier).

**Batch 2 — local, not yet pushed:**
- **005 (FIX/ENHANCE):** $0-load negotiation helper. Confirmed $0 is real Truckstop data (broker posts no rate to invite a call), not an API bug. Cards show "Call for rate" + a Negotiate button. Dialog shows itemized route charges, **walk-away floor** (breakeven) + **lead-with target** (breakeven +15%, tunable `NEGOTIATION_TARGET_MARGIN`), and "if you land $X this load ranks #N of M". Deterministic math (`computeNegotiation`/`netCreditAtGross`), unit-tested for Chip. v1 + v2.
  - **OPEN (per Jason):** rate basis is option 2 (breakeven + margin). Option 3 ("match the current #1 result") is a possible revisit after Chip reviews — may come back to this.
- **002 (FIX):** city/state typo handling. New `api/pcmiler/suggest.js` (reuses PC*MILER locations + Nominatim fallback, cached) + `searchCityState` client helper + reusable permissive `<CityStateInput>` typeahead (suggestions + free text, geocode-on-blur validates, can't save on confirmed typo). Wired into datum entry (v1 `StartRequest`, v2 `SearchView`). Fleet home (street address, not city/state): v1 `FleetSetup` now blocks save on geocode failure; v2 `ProfileTab` already gated + now clears stale coords on edit.
  - **Needs staging smoke test:** suggest endpoint needs the live `PCMILER_API_KEY` (server-only) — not exercisable locally.

**Batch 2 also folds in two fixes from staging testing of batch 1:**
- **Pickup date displayed off by one day** (e.g. a 6/1 load showing "May 31"): date-only `YYYY-MM-DD` strings were parsed as UTC midnight and rendered a day earlier in US timezones. Anchored to local noon in `fmtDate` (v2) + `formatDate` (v1). This was also why the ±1-day badge "looked" wrong — the load was actually an exact match; the label lied.
- **Past available date failed the Truckstop call:** `buildSoapEnvelope` now clamps a past (or empty) pickup date up to today. Client mirrors it via `effectivePickupDate` so the search and the ±1-day filter stay aligned (a stale request is treated as "available now"). Applied in v1 `OpenRequests` + v2 `SearchView`.

**Held for Chip:**
- **007 (Mode field / partial loads):** Truckstop modes captured — Truck Load, LTL, Intermodal, Partial, Drayage, Parcel, Air, Water, Ocean (multi-select). Ryder wants Partial. Likely lives at Fleet setup; threads into the SOAP envelope (currently equipment-only).
- **008 (Haul + keep searching):** add a "finalized vs. keep searching" checkbox during Haul This Load. Maps onto an intermediate status — reuse the WWP `pending→booked→hauled` pattern.

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

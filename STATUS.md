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

## What Was Just Completed (May 27, 2026, session 2)

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
- **Waiting on Chip's feedback** on Work Week Planning results quality.
- **Remove `[WWP]` debug logging** from algorithm once Chip validates.
- **Crisp chat** — uncomment `CrispChat` in App.jsx + AppV2.jsx and the button in HelpView.jsx when ready to launch.
- **Truckstop datum issue** — some fleets have stale `home_address` causing empty datum city/state; fix: re-verify in Fleet Setup.
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

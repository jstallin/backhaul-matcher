---
name: project-trimble-actuals-report
description: Trimble actuals reporting feature — monthly hauled load report for PC*MILER billing reconciliation
metadata:
  type: project
---

Trimble actuals report built May 2026. Trimble bills per hauled load ($0.10/load), with minimums ramping after month 3 and 6.

**Why:** Trimble agreement requires monthly actuals report of loads hauled using PC*MILER routing. Billing is $0.10/load — months 1–3 no minimum, months 4–6 $250 minimum, months 7+ $500 minimum.

**How to apply:** When touching the "haul this" flow or billing tiers, check all four pieces below stay in sync.

## Key pieces

- **`backhaul_requests` columns added:** `hauled_load_id TEXT`, `hauled_load_source TEXT` — populated when a load is marked hauled (migration `20260518000001_add_hauled_load_fields.sql` applied to production)
- **`src/components/OpenRequests.jsx` `handleCompleteRequest`** — saves `hauled_load_id` (= `match.load_id`) and `hauled_load_source` (= `match.source`) on completion
- **`GET /api/orgs/trimble-actuals?month=YYYY-MM`** — admin-only endpoint in `api/orgs/[action].js`, returns completed loads for the month
- **`api/cron/refresh-requests.js`** — contains `handleTrimbleMonthlyReport()` dispatched via `?action=trimble-report`; runs on the 1st of each month at 8am UTC (vercel.json cron)

## Admin Dashboard
- "Trimble Actuals — This Month" section shows live load table, count, estimated cost with tier
- Billing start date stored in `admin_settings` key `trimble_billing_start` as `{ date: "YYYY-MM-DD" }` — set via date input in Admin Dashboard

## Monthly email
- Resend sends print-ready HTML to all `admin_users` on the 1st
- No user-identifying data in the report — only timestamp, load ID, source
- Logo: `https://haulmonitor.cloud/haul-monitor-logo.png`

## Function count constraint
Vercel plan limit is 12 serverless functions. Currently at 12 — any new API file requires consolidating into an existing one (use `api/orgs/[action].js` or `api/cron/refresh-requests.js` with action dispatch).

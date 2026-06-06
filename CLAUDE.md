# Haul Monitor — Backhaul Matcher

Fleet operators post open requests and the app finds available loads along their route home, calculates net revenue, and surfaces the best match. React + Vite frontend, Supabase (Postgres) backend, deployed on Vercel. The strategic direction is zero-copy: query load boards in real-time via API partnerships, never persist third-party load data.

## Tech Stack

- **Frontend:** React + Vite, no TypeScript, inline styles throughout, theme via `useTheme()` hook
- **Backend:** Supabase (auth + Postgres), RLS enabled on all tables
- **Routing:** PC*MILER (Trimble) — `pcmiler.alk.com/apis/rest/v1.0/` — agreement in principle, paying contract starts July 2026, first 3 months billed on actuals only, next 3 months actuals but $250 minimum monthly spend, following 3 months actuals but $500 minimum monthly spend.
- **Map:** Leaflet + React-Leaflet
- **Deployment:** Vercel — serverless functions live in `/api/`
- **Load sources:** DirectFreight scraper (disabled), Truckstop via direct partnership agreement (active)

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.js` | All DB helpers (`db.requests`, `db.fleets`, etc.) |
| `src/utils/routeHomeMatching.js` | Core matching algorithm, PC*MILER calls, session cache |
| `src/utils/routeCorridorService.js` | Route corridor with 1hr in-memory cache |
| `src/utils/pcMilerClient.js` | Client wrappers for PC*MILER proxy endpoints |
| `src/utils/getLoadsForMatching.js` | Load sourcing for matching |
| `api/pcmiler/route.js` | Server proxy: route reports (mileage) |
| `api/pcmiler/routepath.js` | Server proxy: route geometry (GeoJSON) |
| `api/pcmiler/tile.js` | Server proxy: map tiles (falls back to OSM) |
| `src/components/OpenRequests.jsx` | Main workflow view — request results (v1) |
| `src/components/BackhaulResults.jsx` | Results list + financials display |
| `src/components/FleetSetup.jsx` | Fleet profile + rate config |
| `src/components/RouteHomeMap.jsx` | Leaflet map with route corridor |
| `src/components/Dashboard.jsx` | Net revenue hero stat + fleet overview |
| `src/App.jsx` | Top-level (v1), `currentView` state drives navigation |
| `src/AppV2.jsx` | Top-level (v2), handles routing, buy modal, credit state |
| `src/components/v2/SearchView.jsx` | V2 main search + results view |
| `src/components/v2/EstimatesView.jsx` | V2 estimates workflow |

## Coding Conventions

- **Naming:** DB column names are `snake_case`; JS state and variables are `camelCase`
- **No TypeScript** — plain JS throughout, no type annotations
- **Styling:** inline styles only, no CSS files or CSS-in-JS libraries
- **API calls:** all PC*MILER calls go through Vercel serverless proxies — never call PC*MILER directly from the client
- **Keys:** Supabase anon key is client-safe; service role key and `PCMILER_API_KEY` are server-only env vars
- **Serverless functions:** Now on **Vercel Pro** — the Hobby 12-function cap is lifted (Pro allows ~100), so new files under `api/` are fine again. We currently sit at 12 functions; the historical piggyback pattern (`geocode.js?suggest=1`, `[provider].js`, `[action].js`) is still good hygiene but no longer mandatory. Count with `find api -name "*.js" -not -path "*__tests__*" | wc -l`.
- **Matching algorithm:** 2 API calls per load (datum→pickup + delivery→home); `load.distance_miles` used for pickup→delivery
- **Session cache:** module-level Map in `routeHomeMatching.js`, keyed by datum+home+relay; persists across tab switches
- **Relay mode:** when `is_relay=true`, measure from home→pickup (not datum→pickup); `additionalMiles` = full relay driver loop

## Files Claude Should Never Touch

- `FleetSetup.jsx.bak`, `OpenRequests.jsx.backup`, `Fleets.jsx.backup` — backup files, do not edit or delete
- `.env` / `.env.local` — never read or modify env files directly
- Supabase service role key — never expose client-side

---

## UX Versions

Two UX versions exist and **both must be supported** for the foreseeable future. Do not assume either is deprecated.

- **v1** — original user experience; components in `src/components/` (root level)
- **v2** — updated user experience, currently in parallel development; components in `src/components/v2/`

Any changes to shared logic, matching algorithm, or data layer must be validated against both versions.

---

## Infrastructure & Partner Status

| Service | Status |
|---------|--------|
| PC*MILER (Trimble) | Agreement in principle; paying contract starts July 2026, first 3 months on actuals |
| Supabase | **Pro (production)** — daily backups (7-day retention) included; no inactivity pause. PITR is a separate add-on if point-in-time recovery is needed. |
| Vercel | **Pro (production)** — 12-function cap lifted; sub-daily / up to 40 crons available. |
| Truckstop | Production access active; valid while pilot customer org has a valid integration ID |
| Resend | Free tier; sufficient for current pilot scale |

**Pilots:** 1–2 pilot customers starting imminently (May/June 2026). Production stability is the top priority.

---

## Staging Environment

A full staging pipeline is configured and active.

| Item | Value |
|------|-------|
| Staging branch | `staging` |
| Staging Vercel project | `backhaul-matcher-staging.vercel.app` |
| Staging Supabase project | `haul-monitor-staging` |
| Staging Supabase URL | `https://vdrkpitooqgmmlfrbphi.supabase.co` |
| Staging Supabase project ID | `vdrkpitooqgmmlfrbphi` |

**Promotion workflow — step by step:**

1. Do your work on the `staging` branch locally
2. `git push origin staging` — your only terminal push command
3. CI runs automatically (unit tests + Playwright); wait for green
4. Smoke test the change on `https://backhaul-matcher-staging.vercel.app/app`
5. In GitHub, click **"Compare & pull request"** → **"Create pull request"** (staging → main)
6. Confirm the PR page shows tests passing
7. Click **"Merge pull request"** — production deploys automatically
8. Never `git push origin main` from the terminal — the PR merge does it

**After merging, resync your local branches:**
```bash
git checkout main && git pull
git checkout staging && git merge main
```
This keeps staging caught up with main so your next push doesn't create conflicts.

**Database migrations:**
1. **Staging is manual:** when you create a migration during dev, apply it to **staging** (`vdrkpitooqgmmlfrbphi`) yourself via `supabase db push` (CLI, linked to staging) so staging can be smoke-tested. CI does not do this.
2. **Prod is automatic on merge:** the Supabase GitHub integration (the "Supabase Preview" PR check) applies `supabase/migrations/` to production (`cxvmkvhwqktkktczpuyk`) when the PR merges to `main` (first observed working with PR #101, June 2026).
3. **But always verify** — auto-apply is not a substitute for confirmation. After every migration-bearing merge, check the change landed on prod (query `information_schema` / `pg_get_functiondef`, and `supabase_migrations.schema_migrations` for the repo filename version) and confirm the prod behavior. If the code is live but the migration isn't, prod breaks for the new path (e.g. the #67 "Failed to save" window). Fallback if the integration didn't fire: `supabase link --project-ref cxvmkvhwqktkktczpuyk && supabase db push`, then **relink staging** (`supabase link --project-ref vdrkpitooqgmmlfrbphi`).
4. If a migration file is **edited after it was applied to staging** (e.g. scope change during review), reconcile staging by hand with a one-off SQL fix — the version is already in staging's history and won't re-run. Prod gets the corrected file as long as the edit happens before merge.

**Rules:**
- Never commit directly to `main` — all changes go through `staging` first
- Never use staging Supabase credentials in production and vice versa
- CI (GitHub Actions) runs unit tests on all PRs to `staging` and `main`
- Playwright E2E tests run on pushes and PRs; target URL is dynamic based on branch
- Authenticated Playwright tests only run against production (staging has a separate user DB)
- GitHub Actions secrets: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`
- Branch protection is ENABLED on `main` (June 2026, requires GitHub Pro): required checks `unit-tests` + `Playwright cross-browser tests`, strict up-to-date, enforced for admins. A PR cannot merge until both checks pass — wait for green before merging (the #112/#113 lesson).

---

## Planned Features & Specs

Feature specs live in `docs/specs/`. Check there before building any new feature.

| Spec | File | Status |
|------|------|--------|
| Dedicated Fleet Backhaul Planning | `docs/specs/dedicated-fleet-planning.md` | Pending co-founder sign-off |

---

## Current Work & Known Issues

*This section should be kept current. Update when starting or completing significant work.*

- Test suite needs expansion — coverage for both v1 and v2 UX, user flows, and calculation accuracy
- Map rendering: monitor for source duplication errors when plotting routes (known intermittent issue)
- Notification system: change detection logic for initial page loads and manual refreshes needs review

## Current Status
See `STATUS.md` in the repo root for current work state, roadmap progress, and session handoff notes.
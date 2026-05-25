# Haul Monitor — Backhaul Matcher

Fleet operators post open requests and the app finds available loads along their route home, calculates net revenue, and surfaces the best match. React + Vite frontend, Supabase (Postgres) backend, deployed on Vercel. The strategic direction is zero-copy: query load boards in real-time via API partnerships, never persist third-party load data.

## Tech Stack

- **Frontend:** React + Vite, no TypeScript, inline styles throughout, theme via `useTheme()` hook
- **Backend:** Supabase (auth + Postgres), RLS enabled on all tables
- **Routing:** PC*MILER (Trimble) — `pcmiler.alk.com/apis/rest/v1.0/` — agreement in principle, paying contract starts July 2026, first 3 months billed on actuals only
- **Map:** Leaflet + React-Leaflet
- **Deployment:** Vercel — serverless functions live in `/api/`
- **Load sources:** DirectFreight scraper (testing/transitional), Truckstop via direct partnership agreement (active)

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
| Supabase | Free tier (production); paid upgrade pending — upgrade before pilot load increases |
| Vercel | Hobby tier (production); paid upgrade pending — watch serverless function timeouts |
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

**Promotion workflow:**
```
feature branch → PR to staging → CI runs → staging Vercel deploys → 
manual smoke test → PR staging to main → production deploys
```

**Rules:**
- Never commit directly to `main` — all changes go through `staging` first
- Never use staging Supabase credentials in production and vice versa
- CI (GitHub Actions) runs unit tests on all PRs to `staging` and `main`
- Playwright E2E tests run on all PRs; target URL is dynamic based on branch
- GitHub Actions secrets: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`

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

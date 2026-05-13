# Haul Monitor — Backhaul Matcher

Fleet operators post open requests and the app finds available loads along their route home, calculates net revenue, and surfaces the best match. React + Vite frontend, Supabase (Postgres) backend, deployed on Vercel. The strategic direction is zero-copy: query load boards in real-time via API partnerships, never persist third-party load data.

## Tech Stack

- **Frontend:** React + Vite, no TypeScript, inline styles throughout, theme via `useTheme()` hook
- **Backend:** Supabase (auth + Postgres), RLS enabled on all tables
- **Routing:** PC*MILER (Trimble) — `pcmiler.alk.com/apis/rest/v1.0/` — trial key active, extension pending
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
| `src/components/OpenRequests.jsx` | Main workflow view — request results |
| `src/components/BackhaulResults.jsx` | Results list + financials display |
| `src/components/FleetSetup.jsx` | Fleet profile + rate config |
| `src/components/RouteHomeMap.jsx` | Leaflet map with route corridor |
| `src/components/Dashboard.jsx` | Net revenue hero stat + fleet overview |
| `src/App.jsx` | Top-level, `currentView` state drives navigation |

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

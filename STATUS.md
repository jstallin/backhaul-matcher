# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** June 18, 2026
- **Session type:** Claude Code (session 15 — Ryder batch #163 save-a-load + #164 v2 map plotting/legend/overlap + #165 detail-map A→B lane; notification HTML unification also shipped earlier this session)
- **Updated by:** Claude Code (session 15)

---

## Issue Tracker & Cadence (started May 31, 2026)

**GitHub Issues is the durable backlog** — `gh issue list` (repo `jstallin/backhaul-matcher`). STATUS.md stays the per-session narrative; link issue numbers here rather than restating.

- **Labels:** priority `P1` (blocks pilot/prod — drop everything) / `P2` (soon) / `P3` (backlog); type `bug`/`enhancement`; area `area:v1`/`area:v2`/`area:api`/`area:infra`; source `ryder`/`chip`.
- **Milestones:** `Pilot — Week 1`, `Infra / Paid Tiers`.
- **Numbering:** kickoff IDs 001–009 are preserved in issue *titles* (`[007] …`); GitHub assigns native numbers (#20+). New pilot issues just use native numbers — the 00x scheme is retired.
- **Flow:** intake (Chip/Ryder feedback → labeled issue) → triage (P1/P2/P3) → branch off `staging` → `Fixes #N` in commits → PR staging→main → smoke test → merge → apply migrations → resync.
- **Seeded:** 001–009 created and **closed** as shipped (#20–28). Open follow-ups: **#29** Vercel Pro upgrade (P2, unblocks 006 server-side + 008 cron), **#30** 007 full mode filtering + live LoadType validation (P3), **#31** 005 negotiation option-3 revisit (P3).

---

## What Was Just Completed (June 18, 2026, session 15) — Ryder batch #163/#164/#165 + notification HTML unification

**All SHIPPED to production and verified.** Two PRs merged: **#162** (notification email unification) and **#166** (the #163/#164/#165 batch). Migration `20260618000001_saved_loads.sql` auto-applied to prod by the Supabase integration and **verified** (table + 4 RLS policies + 33 cols + version in `schema_migrations`, no drift). Issues #163/#164/#165 closed; local branches resynced.

- **Notification emails unified (earlier this session, PR #162):** auto-refresh (cron) emails were plain text while client emails were HTML — two divergent send paths. New shared `src/utils/notificationEmail.js` (`buildBackhaulNotification` + `buildRequestLink`) used by BOTH `notificationService.js` (client) and `api/cron/refresh-requests.js` (cron); cron now passes `html` to Resend. Confirmed live: the auto-refresh email arrives as branded HTML with a working `/app?request=<id>` link. (Verifying the live send required a non-expired request with live Truckstop inventory — the lane was briefly empty (`loadsSearched:0`) during testing, unrelated to the change.)

- **#163 (P2, ryder/whats-new) — Save a load (v1 + v2):** new dedicated **`saved_loads`** table (snapshot of the live load + `request_id`; deliberately NOT `imported_loads`, so saves never enter the matching/import pipeline — `getLoadsForMatching` reads `imported_loads`). `db.savedLoads` helpers + pure tested `buildSavedLoadRow` mapper (`src/utils/savedLoad.js`). Shared **`SaveLoadButton`** (bookmark toggle) on all 4 surfaces (v1 card+detail, v2 MatchCard+RouteDetailsModal) + new `Bookmark` icon. Shared **`ContactBrokerDialog`** extracted from inline Call/Text/Email JSX. "Saved" filter in BOTH Loads views (v2 `LoadsView` tab, v1 `ImportedLoads` chip) backed by one shared **`SavedLoadsPanel`**: table (status "Saved") + per-row action dropdown — **View** (snapshot detail), **Haul** (completes the originating request via the existing flow when `request_id` present), **Contact Broker**. The dropdown renders via a **portal** (fixed positioning) so the table's overflow container can't clip it (the "menu hidden below a short table" fix).

- **#164 (P2, ryder, v2 bug) — result map plotting:** root cause was v1 ran a coordinate-backfill geocode for coordless Truckstop loads and v2 didn't (so v2 markers collapsed onto state centroids and points vanished). Extracted into shared `src/utils/geocodeMatchCoords.js` (`geocodeMissingCoords`, fills flat + nested coords), now used by BOTH v1 and v2. Added the **legend** to v2 (parity with v1). `RouteHomeMap` now **fans overlapping markers** out with a deterministic golden-angle offset (no clustering dep) so co-located loads are all visible/separate on zoom.

- **#165 (P2, ryder) — load-detail map A→B context:** `RouteMap` takes optional `datum` (A=empty) + `home` (B=fleet home); draws A/B markers + a grey lane line, passed from both detail map modals (coords already in scope). Per Ryder follow-up, the lane uses the **actual PC*MILER preferred driving route** (solid grey) when fetchable, falling back to a straight dashed line. NOTE: this adds a PC*MILER route call when a detail map opens with A/B — same class as the existing load-route call; watch ahead of the July billing-on-actuals window.

**New shared modules this session:** `notificationEmail.js`, `savedLoad.js`, `geocodeMatchCoords.js`, `SaveLoadButton.jsx`, `ContactBrokerDialog.jsx`, `SavedLoadsPanel.jsx` + `Bookmark` icon. Tests added for `savedLoad`, `geocodeMatchCoords`, `notificationEmail` (suite now 356).

---

## What Was Just Completed (June 15, 2026, session 14) — Ryder request-form batch #158/#159/#160

**All three SHIPPED to production and verified** (PR #161, merged to `main`; migration `20260615000001` auto-applied to prod by the Supabase GitHub integration and confirmed — the 5 new columns exist on `backhaul_requests` and the repo-filename version is in `schema_migrations`, no drift). Issues #158/#159/#160 closed. Local `main`/`staging` resynced. Bundled deliberately — all three touch the create/edit backhaul request form + results UI.

- **#158 (P2, ryder) — "Limit Weight?" field.** New checkbox + "Max Weight" number input above the relay toggle (v1 `StartRequest`, v2 `SearchView` RequestForm). Stored as `backhaul_requests.max_weight_lbs` (null = no limit, i.e. unchecked). **Filtering is post-fetch in `fetchTruckstopLoads` (`api/_lib/truckstop.js`)** — the single chokepoint shared by the manual proxy path (`getLoadsForMatching` → `[provider].js`) **and** the cron — because Truckstop's SOAP `LoadSearch` has **no weight criterion**. Loads with no reported weight pass through (mirrors the existing fleet-profile weight behavior in `routeHomeMatching.js` line ~337). New `api/__tests__/truckstopMaxWeight.test.js` (over-cap dropped, unknown kept, at-cap eligible, zero = no limit).
- **#159 (P2, ryder) — "Bypass Fleet Home".** New checkbox + verified "Search Home" `CityStateInput` (geocoded/verified exactly like the datum point; coords captured at verify time and saved). `findRouteHomeBackhauls` gained an optional **trailing `searchHome` param**; when set it reassigns `fleetHome` at the top so every downstream reference (corridor, Haversine, PC*MILER legs, distance-cache key) uses the substitute. Per-request routing override only — `fleet_id`/rates/equipment unchanged. **Wired through all three matching call sites** — v1 `OpenRequests`, v2 `SearchView`, **and the auto-refresh cron `refresh-requests.js`** — so cron results don't diverge from manual (the [[project_datum_geocoder_divergence]] trap). Results show a banner: *"This request is running with the substituted search home, replacing fleet's home."* New columns: `bypass_fleet_home`, `search_home_address`, `search_home_lat`, `search_home_lng`.
- **#160 (P2, ryder) — broker email/company on the load card.** v1 `BackhaulResults` card: the "Contact Broker" row was gated on a phone being present, so email-only loads hid the email — now renders whenever phone **or** email exists, and shows the email address text (not just the mailto button). v2 `SearchView` card: added the email address text alongside the existing "Email" button. Broker **company name** was already on both cards (`match.broker`).

**Follow-up fixes after Ryder tested #159 on prod (same session, second commit in PR #161):**
- **v2 mobile form layout** — the RequestForm's two-column grid didn't collapse on phones (labels/inputs misaligned). Now single-column on mobile via `useMobile`; the controls nested under the new toggles drop their 46px indent on mobile so inputs keep full width.
- **Map plotted the original fleet home** — with bypass on, matching correctly routed to the search home but the map's `fleetHome` marker (and the straight-line fallback drawn when PC*MILER geometry is absent) still used the fleet's original home. The map's `fleetHome` now resolves to the request's search home when bypass is active — fixed in **both** v2 (`SearchView` ResultsPanel) **and** v1 (`OpenRequests` → `BackhaulResults`), since v1 had the identical defect.

**Verify-on-prod checklist worth running with live loads:** create/edit a request with Bypass Fleet Home on, confirm it saves + reloads on edit, the banner shows, and the map plots the substituted home + corridor toward it.

---

## What Was Just Completed (June 10, 2026, session 13) — high-fidelity server-side auto-refresh (v2 timer + cron PR1–PR3 + unified geocoder)

**On `staging`, validated end-to-end via manual cron fires; PR to `main` opened.** Commits `a17ebf4 … 8e46e80`. No migrations. The arc started from a question — "does an auto-refresh count as a Last Search on the admin dashboard?" — and turned into making the server cron actually trustworthy.

**Started here:** the cron (`api/cron/refresh-requests.js`) was the only thing that *should* do background refresh, but it ran a **divergent inlined matching algorithm** against a **static JSON snapshot**, never charged, and isn't even scheduled. And v2's client-side auto-refresh timer was broken.

- **v2 auto-refresh timer fix** (`SearchView.jsx`): the `setInterval` was torn down/recreated every render because `runMatching`'s identity churned (depends on the non-memoized `deductCredit` from `useCredits`), which reset the countdown every second and meant the refresh never fired. Decoupled via a `runMatchingRef` so the interval is stable — now consistent with v1.
- **PR1 — real algorithm in the cron:** deleted the inlined copy; the cron now imports the real `findRouteHomeBackhauls` and passes full fidelity (`rateConfig`/net revenue, relay flag, pickup window, geocode-aware radii). `supabase.js` + `pcMilerClient.js` made **isomorphic** (server context → `process.env` + direct PC*MILER w/ `PCMILER_API_KEY`; client unchanged).
- **Unified datum geocoder** (`src/utils/geocodeDatum.js`): v1/v2/cron previously used **three different** geocoders (Mapbox / PC*MILER / Mapbox+hardcoded) → the *same* request gave wildly different match counts (v1=0 vs v2=71 was a geocode divergence, not the algorithm). New canonical **PC*MILER → Mapbox → local** chain, used everywhere. (Estimates flow still on `parseDatumPoint` — follow-up.)
- **PR2 — live Truckstop in the cron:** extracted the Truckstop SOAP search into a shared server module `api/_lib/truckstop.js` (single source of truth; the endpoint imports from it). Cron resolves the request owner's per-org integration ID (service-role: `org_memberships` → `get_ts_integration_id`) and fetches live loads with the client's exact params. **Connected orgs never fall back to the demo set** (would fabricate matches / fake a material charge) — only not-connected orgs do.
- **PR3 — charge-on-material:** materiality (`detectNotifiableChange`) now gates **both** billing and notification. Material change → deduct 1 credit (pilot orgs get a `type='pilot'` would-be ledger row, balance untouched, #131) **and** insert a `user_activity_events` `search_run` row (`source=auto_refresh`). Non-material/first run → free, no event. **This answers the original question: an auto-refresh counts as a "Last Search" only when it's material.**

**Bugs caught during live staging validation (each only surfaced on a real cron run — bundle/load tests can't catch logic):**
- **Native-ESM** (`FUNCTION_INVOCATION_FAILED`/`ERR_MODULE_NOT_FOUND`): Vercel runs `api/` as native Node ESM (not bundled), so the imported client graph needed explicit `.js` extensions + `with { type: 'json' }`. Faithful local check: `node --input-type=module -e "import('./api/.../fn.js')"`. (memory: [[reference_vercel_native_esm_imports]])
- **Unwrap bug:** `findRouteHomeBackhauls` returns `{opportunities, routeData}`; the cron treated it as the array → every match silently discarded, `material` always false.
- **One-to-one embed:** `fleet.fleet_profiles?.[0]` — PostgREST returns a one-to-one embed as an **object, not array** → `null` profile → `equipmentType: null` (→ the all-equipment filter `"V F R SD LB"` that Truckstop returns **0** for) + no `rateConfig` + default fleet specs. Fixed with `Array.isArray` handling (mirrors `SearchView`). (memory: [[feedback_postgrest_one_to_one_join]])

**Validated on staging (`test 003`, NYC→Davidson):** live `loadsSearched: 1330`, `matchesFound: 34`, `last_top_net: 600` (net revenue computing), and a forced material run confirmed in the DB — a `credit_transactions` `type='pilot'` row + a `search_run` (`source=auto_refresh`) event; the non-material run inserted neither.

**Open follow-ups filed:** **#143** (P2) same-city/local-radius mode (real Ryder use case); **#144** (P2) client-side auto-refresh likely redundant now — discuss with Chip + the cron isn't scheduled in `vercel.json`; **#145** (P2) Mapbox NC proximity bias mis-geocodes distant cities (corridor quality — built NYC corridor from Shelter Island); **#146** (P3) Truckstop all-equipment filter returns 0.

**Caveats before relying on this in prod:** (1) the **cron isn't scheduled** — only runs on manual fire (couple with the #144 decision); (2) **real credit deduction** (`deduct_credit`) wasn't exercised — the test account is a pilot org, so only the would-be-charge path ran (code mirrors the proven Stripe endpoint); (3) fix **#145** before trusting cron *match quality* for non-NC origins; (4) verify `MAPBOX_TOKEN` is set as a **runtime** env on prod (it was missing on staging until this session) or the geocoder collapses to the NC/FL local table.

---

## What Was Just Completed (June 7–8, 2026, session 12) — Ryder outage + #129 fleet sharing + Datum→Empty + cleanup

**All shipped to production and verified** (PRs #116, #119, #121, #125, #126, #130, #132, #133, #134, #135, #136). The detailed per-issue narrative for the June 6–8 batch (#115, #117, #118, #120, #122, #123, #124, #127-app, #128, #131) is in the **session-11 addenda below**; this entry covers the new/uncaptured items.

- **#129 (P2, ryder) — share fleets across an org, view-only — SHIPPED + verified on prod** (PR #135 + #136 follow-up; migration `20260608000004`, version matches repo on prod, no drift). A fleet owner grants specific org members view-only access via a search-as-you-type member multi-select (`OrgMemberMultiSelect`, on fleet create + edit). Shared fleets show in the recipient's list badged "Shared by X · View only" (no edit/delete) and are selectable on backhaul/estimate/WWP (dropdowns mark them "· shared"). **Recursion-safe RLS is the crux:** `fleet_shares` table + SECURITY DEFINER helpers (`current_user_owns_fleet`, `fleet_shared_with_current_user`) break the fleets↔fleet_shares policy cycle; recipients get additive SELECT-only policies on fleets/fleet_profiles/trucks/drivers, owner write policies untouched → view-only enforced at the DB. All fleet/profile reads are component-layer (`db.fleets.*`), so the RLS change unlocked the whole search/estimate/WWP pipeline with no algorithm change. Owner-only sharing (decided with Jason); shared fleets surface everywhere `getAll` is used. **#136 follow-up:** viewers can be chosen at fleet-creation time (persist right after create), not only after.
- **#127 landing/guide (PR #134)** — carried the Datum → "Empty City, ST" / "Empty" / "empty location" relabel into the static marketing HTML (`public/index.html` landing, `public/user-guide.html`) that the app-only relabel had missed. Code/DB identifiers (`datum_point`) untouched.
- **#131 pilot follow-up — confirmed live on prod:** Org Activity tile now shows real would-be revenue for the Ryder org (**$36 potential income** observed). Closes the "pending live confirmation" note in addendum 5.
- **Ryder "no results" outage — RESOLVED (config, not code)** — detail in addendum 4 below; bad/missing per-org Truckstop integration ID, fixed in prod SQL. Runbook in memory ([[truckstop-per-org-integration-zero-results]]).
- **#137 — GitHub Actions bumped off the Node 20 runner** (before the June 16 deadline): all 5 workflows → `checkout@v6`, `setup-node@v6`, `cache@v5`, `upload-artifact@v7`, `download-artifact@v8`. CI confirmed green with the Node 20 deprecation warning gone.

**Carry-forward (parked):**
- **$2.00/credit projection anchor (#131)** — pending Chip's preference (pricing tiered to $1.33; one `EST_CREDIT_PRICE` constant in `AdminDashboard.jsx`).
- Open P3 backlog: #30, #31, #45, #77, #78. Infra account-ownership transfer runbook (`ACCOUNT-OWNERSHIP-RUNBOOK.md`) — human-at-keyboard, both founders.

---

## What Was Just Completed (June 5–6, 2026, session 11) — Ryder feedback batch #81–#85 + fleet duplicate + CSP finish + What's New banner + user guide

Everything below **shipped to production** (PRs #101–#102, #104–#107, #109, #111–#114, all merged). Four new migrations (`20260605000004` → `20260606000001`) auto-applied to prod by the Supabase GitHub integration and **verified June 6** — `supabase migration list` shows local = remote on both prod and staging; CLI relinked to staging afterward.

**Ryder pilot-feedback batch (all five from session 8 intake, all closed):**
- **#81 — "Driver Needed Home By"** date field on backhaul requests (migration `20260605000004_add_driver_home_by`). Display-only (not sent to Truckstop); shown at results top + load detail header. Follow-up refinement: **dropped from estimate requests** (`896faef`) — backhaul-only. v1 + v2.
- **#82 — Share load from detail view** (Email / Text / Copy). Email via Resend with reply-to = logged-in user; Text via Twilio; Copy → clipboard. Every share tracked (migration `20260605000005_add_load_shares`). v1 + v2.
- **#83 — Expired backhaul requests auto-disabled** (End Pickup Window fully in the past): derived-from-dates approach as planned — no stored status, **no migration** (`requestExpiry.js` + tests). Run blocked in UI (manual) and skipped in the cron (no credit burn); re-enables on date edit. v1 + v2 incl. estimates.
- **#84 — "Operations Declined"** cancellation reason + Reports tile aggregating declined top-load revenue. Zero-copy crux handled as designed: top-load gross / customer-net / carrier-net **snapshotted at decline** onto the request (migration `20260605000006_add_declined_top_snapshot`, `declineSnapshot.js` + tests). v1 `FleetReports` + v2 `ReportsView`.
- **#85 — Admin Dashboard "Org Activity"** section: per-user last login / request created / search run / load detail opened, hauled revenue, ops-declined lost revenue. The shared telemetry mechanism landed here as planned: new **`user_activity_events`** table (migration `20260606000001`) + `activityEvents.js` emitter, rollups in `api/orgs/[action].js`.

**Also shipped:**
- **#38 — Duplicate a fleet** (v1 `Fleets` + v2 `FleetsView`, `db.fleets` copy helper).
- **#94 (security P2, closed) — CSP `script-src 'unsafe-inline'` dropped.** The `app.html` inline SW script externalized to `public/sw-register.js`; CSP now fully enforcing without unsafe-inline. **Security sweep is now fully closed** — #86 also closed (Truckstop integration-ID rotation deferred/accepted by Chip as residual risk; logs showed no calls in the retained window).
- **#108 — "What's New" release banner**, driven by GitHub milestones: `scripts/generate-whats-new.mjs` + `whats-new.yml` workflow regenerate `public/whats-new.json`; dismissible banner in v1 `Dashboard` + v2 `Shell`. Content seeded ("June 2026 - Pilot Updates!"). Fixed a Playwright strict-mode flake the banner content introduced (broad text assertions now `.first()`, `f12ccb2`).
- **#103 — User guide updated** for all June 2026 features (Duplicate Fleet, Driver Home By, expiry behavior, Share, Declined reports, Modes field) + new/refreshed screenshots.
- Docs: CLAUDE.md records that prod migrations auto-apply via the Supabase GitHub integration on merge (`e1c8ac8`) and that branch protection is enabled on `main` (`90c1322`).

**Open backlog is now all-P3:** #78 (LinkedIn/founder schema), #77 (mobile app discussion), #45 (Ryder uses Edge), #31 (negotiation option-3 revisit), #30 (full mode filtering + LoadType enum validation).

**Addendum 5 (June 8 cont.) — more Ryder UI + admin work, all shipped to prod:**
- **#123 (P2)** — stopped logging the Truckstop SOAP envelope (leaked IntegrationId + WS UserName to Vercel logs; Password was already redacted). Log-only.
- **#124 (P2)** — GitHub Pro added to admin Fixed Monthly Infrastructure Costs (front of list, default $4/mo).
- **#127 (P2)** — relabeled "Datum" → **"Empty City, ST"** (form fields) / **"Empty"** (headers, map marker/legend, breakdown leg "Empty → Pickup") / "empty location" (Help + empty-state prose), v1 + v2. UI strings only; `datum_point` and all code/DB identifiers untouched. (First tried "Pick-up Location"; Chip/Jason redirected to "Empty".)
- **#128 (P2)** — backhaul request name now optional; blank → auto-generates `<display name> — <empty location> — <date>` (creation date), timestamp on collision. New `requestName.js` + 7 tests.
- **#131 (P2)** — Org Activity tile now shows per-user **billable credit spend** (credits used all/30d) + **projected revenue** (est. @ $2.00/credit starter rate, labeled). Source = SQL aggregate `get_credit_usage_by_user` over `credit_transactions` (migration `20260608000002`). Chip to confirm the $2/credit anchor (pricing is tiered to $1.33; one `EST_CREDIT_PRICE` constant).
  - **Follow-up fix (PR #133, migration `20260608000003`, on prod):** the tile read 0 for pilot users because **pilot orgs bypass credit deduction entirely** (`api/stripe` deduct returns success without writing a ledger row) — so the cohort we want to measure left no `credit_transactions` trail. Pilot stays free; the deduct endpoint now **records the would-be charge** as a `type='pilot'` row (balance untouched), the aggregate counts `type IN ('usage','pilot')`, and a one-time backfill recovered past pilot search/estimate usage (1cr each) from `search_run` events (WWP/auto-refresh history unrecoverable). `credit_transactions` has no other readers (balance is in `user_credits`), so the new type is low-risk. **Pending live confirmation that the Ryder tile now populates.**

**Addendum 4 (June 8) — Ryder "no results" outage diagnosed (config, not code) + #122 fix shipped:**
- **Ryder demo users getting 0 results** — root-caused to a **bad/missing per-org Truckstop integration ID** on the Ryder org, NOT the weekend search changes. Proved by holding fleet/request identical and swapping the known-good Ryder ID into the haulmonitor.cloud org (validated + returned a full result set). Confirmed via Vercel prod runtime logs (`get_runtime_logs`): a working search = `GET /api/integrations/truckstop → 200` + a flurry of `/api/pcmiler/route` legs. The trap: post-#64 (env-fallback removal, June 2) an org with a null/invalid stored ID silently falls back to empty data → "no matches" (no error). Fix = re-store the good ID on the Ryder org via `store_ts_integration_id('<org>','905765')` (Jason ran it in prod SQL; org `0a1b77a2-…`). HM's own ID restored after the test. Runbook saved to memory ([[truckstop-per-org-integration-zero-results]]).
- **#123 (P2, filed)** — the Truckstop SOAP envelope log (`[provider].js:814`) redacts Password but leaks `IntegrationId` + `UserName` to Vercel logs. Drop/gate it. Not yet done.
- **#122 (P1, SHIPPED to prod, PR #125)** — v2 fleet save (`buildFleetPayload`) never wrote `revenue_split_customer`, so it fell to the column `DEFAULT 20` regardless of carrier (v2 fleets stored 20/20 not 20/80). Numbers were always correct (calc derives customer = 100−carrier), but the stored row was wrong. Fixed: write the complement (mirrors v1) + 2 tests + backfill migration `20260608000001`. **Verified on prod**: migration version matches repo filename in `schema_migrations` (no drift); backfill corrected existing rows incl. Ryder's `03832`.

**Addendum 3 (June 7 early AM):** **#120 (P2) — installed PWA served stale bundles — fixed and shipped to prod** (PR #121). Jason's iPhone home-screen app was still on pre-#117 code (1 match) while Chrome showed the new bundle: PWAs resume from a snapshot, so `sw-register.js`'s load-event-only `registration.update()` never re-ran. Now re-checks on `visibilitychange`→visible + bfcache `pageshow` (throttled 1/min); existing skipWaiting→controllerchange chain auto-reloads. **One-time user step:** swipe-kill + reopen the installed PWA once post-deploy; self-heals thereafter. Verify on the *next* deploy: background→foreground alone should pick it up.

**Addendum 2 (June 7 early AM):** **#117 (P1) + #118 (P2) — thin search results root-caused and shipped to prod** (PR #119). Jason's Friday-midnight search returned 4 loads / 0 matches; two compounding causes: (1) **#117** — the Truckstop SOAP query sent a *single* pickup date (window start clamped to **UTC** today → the search asked for Sunday-pickup loads only). Now sends the full remaining pickup window (`buildPickupDates`: max(start, today-CT) → min(end, start+9), cap 10 dates), `equipment_needed_date` threaded through v1+v2 search flows, client ±1-day filter widened to the window so it doesn't re-drop the wider results. Estimates/WWP keep single-date. (2) **#118** — `api/pcmiler/route.js` geocoded stops via Nominatim only; parallel legs got throttled and failed stops were passed raw to routeReports → mass 400s → silent **Haversine fallbacks** (estimates, not actuals, in net revenue). Now PC*MILER Locations first + structured Nominatim fallback + module-level promise cache; unresolvable stops 422 fast. **Tell Chip:** out-of-route miles / net revenue on Truckstop matches will now be PC*MILER actuals far more often — numbers may shift (more accurate) mid-validation. Smoke-proof: same corridor, window starting Jun 8 → 431 loads / 43 matches.

**Addendum (June 6 evening):** **#115 (P2) — admin dashboard mobile layout — fixed and shipped to prod** (PR #116). Wide tables (P&L breakdown, Org Activity, org members) now horizontally swipeable instead of clipping at the viewport edge; Users list rows stack into two predictable lines on mobile via `useMobile`. One shared `AdminDashboard.jsx` covers both v1 + v2. Smoke-tested on staging from Jason's phone; no migration. Also noted in CI: GitHub deprecates Node 20 action runners **June 16, 2026** — bump `actions/checkout@v4`/`setup-node@v4`/`cache@v4`/`upload-artifact@v4` in the workflows soon.

---

## What Was Just Completed (June 5, 2026, session 10) — security sweep shipped end-to-end + CI/test rehab + uptime + migration reconcile

Continuation of the session-9 security review — everything below **shipped to production** (PRs #90, #92, #93, #95, #96, #97, #98, #99, #100, all merged; prod migrations applied + verified live).

**Security (all closed):**
- **#86 (P1 CRITICAL) — shipped + verified.** Anon-executable `SECURITY DEFINER` RPCs (`add_credits` = free credits / Stripe bypass, `get_ts_integration_id` = decrypted Truckstop ID from Vault, + 4 more). Migration `20260605000001` revoked `anon/authenticated/PUBLIC` EXECUTE; verified live on prod (`anon_exec=false`, `service_role` retained). **Issue left open** — Chip declined the Truckstop-ID rotation for now (logs showed no `rpc/get_ts_integration_id` calls in the retained window, but retention < exposure window, so can't prove a negative; rotation still recommended).
- **#87 (P1) — shipped.** Gated the 4 `api/pcmiler/*` proxies behind a Supabase session JWT (`tile.js` uses a Referer allowlist → OSM fallback). Client sends the token via `pcMilerClient.js`. Cron unaffected (calls PC*MILER directly).
- **#88 + #97 (P2) — shipped.** Security headers enforced (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy). CSP shipped Report-Only in #88, then **flipped to enforcing** in #97 (kept `script-src 'unsafe-inline'`).
- **#89 (P3) — closed.** `search_path=public` pinned on 8 flagged functions (`20260605000002`); `route_distance_cache` write policies bounded + UPDATE policy dropped (client now upserts `ignoreDuplicates` — distances are immutable, first-writer-wins) + `handle_new_user` anon EXECUTE revoked (`20260605000003`). Leaked-password protection + min length 8 enabled in the Supabase dashboard (Chip). **Supabase security advisor is now WARN-free** (only 2 intentional INFO "RLS-enabled-no-policy" on `org_integrations`/`org_invites` — server-only locked tables).

**CI / test rehab (#91, closed):** the `api/__tests__` handler tests were never wired into CI and had rotted. Found a real `orgs` `GET /members` 3-way inconsistency → product decision: **roster is viewable by any org member** (removing stays admin-only); reconciled docstring + test (#95). Rewrote `integrations-truckstop.test.js` to the **Vault** model (#96). `api/**` now runs in CI. 247 tests / 14 files green. Also fixed a flaky firefox E2E selector (`getByText('Haul Monitor').first()`).

**Uptime (#98, #99 — shipped):** the Better Stack monitors on `/api/pcmiler/geocode` and `/api/integrations/truckstop` were hitting **gated** endpoints (geocode went false-down 401 after #87, and was burning PC*MILER quota on every ping). Added public, zero-cost health endpoints `/api/pcmiler/health` + `/api/integrations/health` (config-presence only, no billed calls). Chip repointed the monitors — all green.

**Open security residuals (intentional follow-ups):**
- **#86** — Truckstop integration-ID rotation (Chip's call; deferred).
- **#94 (P2)** — drop `script-src 'unsafe-inline'`: externalize the SW inline script in `app.html` + audit static pages, then enforce. Not yet done.

**⚠️ Migration-history drift — RECONCILED (important process lesson):**
Applying migrations via the **Supabase dashboard / MCP `apply_migration`** stamps a wall-clock version (e.g. `20260605153021`) that does **not** match the repo filename version (e.g. `20260605000002`). From ~May 27 onward this drifted, and the **`Supabase Preview` GitHub check started failing** ("Remote migration versions not found in local migrations directory"). Schema was always correct — only the `schema_migrations` version labels drifted. Reconciled by realigning remote `version` → repo filename on **both prod + staging** (9 versions each, `20260527230000`→`20260605000003`). Should be green on the next migration PR.
- **Process fix (do this):** re-link the Supabase CLI (`supabase link --project-ref cxvmkvhwqktkktczpuyk`) and apply migrations via **`supabase db push`** (uses the repo filename as the version) — NOT the dashboard/MCP. This is the standing STATUS TODO and the durable fix. See [[reference_supabase_migration_apply_method]].

**Also this session:** staging Stripe "buy credits" 500 was a missing `STRIPE_PRICE_*` env on the staging project → set up Stripe **test mode** for staging (test key + price IDs). Filed pilot-feedback issues **#81–#85** (Driver-Needed-Home-By field, Share-load Email/Text/Copy, expire stale requests, Operations-Declined reason + report tile, Admin org-activity section) and security follow-ups; **#94** open.

**Deploy gotcha observed:** production deploys here are **gated on CI** — a merge to `main` won't show a prod deployment until Playwright + unit checks pass (Vercel does NOT block on the `Supabase Preview` check). If "no new prod deployment," check the merge commit's CI is green first.

---

## What Was Just Completed (June 5, 2026, session 9) — security review + staging Stripe fix

Triggered by a Reddit thread on "vibe-coded" insecure defaults. Verified each claim against **live production** (Supabase advisor + reading function source/ACLs — not by executing anything destructive).

**Reddit checklist vs. Haul Monitor:** anon key in bundle = *misconception* (it's the publishable key; HM handles it correctly — service-role key not client-exposed, RLS on all public tables with policies). Login rate-limiting = overstated (Supabase GoTrue has baseline limits). localStorage tokens = true (default). Missing security headers = true. Unauthenticated endpoints = true, and worse than the post (see #86/#87).

**The real findings the post didn't mention — `SECURITY DEFINER` RPCs callable by `anon`:**
- **#86 (P1, CRITICAL) — FIX STAGED, prod pending.** `add_credits`, `deduct_credit`, `get_ts_integration_id`, `store_ts_integration_id`, `set_user_as_driver`, `link_driver_to_user` all had `EXECUTE` granted to `anon` (Postgres grants to PUBLIC by default; never revoked). Anon could mint unlimited credits (Stripe bypass) and read the **decrypted** Truckstop integration id from Vault, bypassing RLS. Root cause = classic insecure default. All six are only called server-side with the service role, so the fix is a clean revoke. Migration `20260605000001_revoke_anon_execute_on_security_definer_rpcs.sql` (guarded `DO` block, portable/idempotent) **applied + verified on staging** (anon/authenticated EXECUTE now false, service_role retained). Commit `4972dda`.
  - **AFTER PROD MERGE (manual, required):** apply the migration to prod (`cxvmkvhwqktkktczpuyk`), re-check ACLs, and **rotate the Truckstop integration id** (it was reachable decrypted).
- **#87 (P1) — open.** The 4 `api/pcmiler/*` proxies (route, routepath, geocode, tile) have **no auth gate** → free use of the server `PCMILER_API_KEY`; becomes a metered-cost/bill-amplification risk when the Trimble paying contract starts (July 2026, billed on actuals). `notifications` + `analyze-load` are correctly gated.
- **#88 (P2) — open.** No security headers in `vercel.json` (no CSP/X-Frame-Options/HSTS/etc.); compounds the localStorage-token XSS risk. Fix = headers block + CSP.
- **#89 (P3) — open.** Hardening backlog: `route_distance_cache` permissive write policy (any authed user can poison the shared distance cache), leaked-password protection disabled, mutable `search_path` on several functions.

**What HM does right (honest credit):** table RLS properly scoped (`user_credits` has no direct-write policy — RPC is the only write path), service-role key server-only, Vault used for the integration id, `notifications`/`analyze-load` JWT-gated.

**Staging Stripe "buy credits" 500 — RESOLVED (config, not code).** `POST /api/stripe?action=checkout` 500'd ("Price not configured for starter") because the staging Vercel project was missing `STRIPE_PRICE_STARTER/PRO/FLEET`. Pre-existing gap (credits purchase never worked on staging), unrelated to the migration. Fixed by setting up **Stripe test mode** for staging: test secret key + 3 test price IDs added to the staging project; verified — buy-credits now redirects to Stripe test checkout. (Note: staging had been holding a non-test key.)

---

## What Was Just Completed (June 4, 2026, session 8) — same-city matching fix + pilot feedback intake

**1. Same-city backhaul search returned 0 results — FIXED & SHIPPED TO PRODUCTION.**
When the datum point and fleet home are the same city, `findRouteHomeBackhauls` returned 0 matches even with hundreds of live loads sourced (Chip set up a "Same-Same Request Test", Atlanta→Atlanta, radius 150, which reproduced it). Root cause: live Truckstop loads have no coordinates, so the delivery-state **centroid pre-filter** (`routeHomeMatching.js`) is what gates them — and its test `centroidToHome > haversineDirect` collapses when datum == home, because `haversineDirect ≈ 0`, rejecting every load. Confirmed live: `Corridor filter: 0 candidates from 286 available loads`.
- **Fix:** floor the threshold with the home radius — `if (centroidToHome > Math.max(haversineDirect, homeRadiusMiles)) continue;`. Normal route-home searches are unaffected (`haversineDirect` dominates the max); same-city searches fall back to "delivery state within the home radius" — the right set for a local round-trip. Code-only, **no migration**.
- Added 2 regression tests for the datum == home case (one keeps a nearby-state coordless load, one confirms a far state is still rejected). Full suite green (192 tests). Verified live on staging: 286 loads → **18 opportunities**. Commit `295c165`; PR merged to `main`; local branches resynced.

**2. Ryder pilot feedback (via Chip) → 5 new issues, #81–#85.** All `P2`, labeled `ryder`/`chip`. Two cross-issue dependency clusters worth respecting when sequencing:
- **#81** — "Driver Needed Home By" date field on bh requests (`backhaul_requests.driver_home_by`, migration). Display-only (not sent to Truckstop); shown at top of results + near top of each load detail view. Detail-header layout is designed to leave room for #82. v1 + v2.
- **#82** — Share load from detail view (Email / Text / Copy). Email = Resend w/ reply-to = logged-in user + route map; Text = Twilio, `+1` locked, SMS-sized note; Copy = same content minus map → clipboard. Reuses `api/notifications` (Resend/Twilio). Tracks every share (channel + recipient). v1 + v2.
- **#83** — Disable expired bh requests (End Pickup Window < today): mark inactive, block run (manual + cron, no credit burn), re-enable on date edit. Recommended derived-from-dates approach (no stored status, no migration); keep "expired" distinct from "completed". v1 + v2.
- **#84** — "Operations Declined" cancellation reason (one-line add to shared `cancellationReasons.js`) + Reports tile aggregating the declined request's **top load** gross / customer-net / carrier-net revenue. **Zero-copy crux:** the top load is gone by report time, so its dollar figures must be **snapshotted at decline** onto the request (proposed `declined_top_*` columns, migration). v1 + v2.
- **#85** — Admin Dashboard "Org Activity" section: last login / request created / request updated / search run / load detail opened, hauled revenue (user + org), ops-declined lost revenue (org). Most metrics have existing sources; **last search run** and **last load detail opened** are net-new telemetry.
- **Dependency notes:** #84 → #85 (org-level ops-declined rollup). **#82 ⇄ #85 should share one telemetry mechanism** — recommended a single `user_activity_events` table rather than building event tracking twice; whichever lands first creates it.

---

## What Was Just Completed (May 31, 2026, session 7) — 007, 008, AI cleanup, 009-P2 redo

**✅ ALL SHIPPED TO PRODUCTION** (PR #19 merged to `main`; `fleet_profiles.modes` migration `20260531000001` applied to prod + verified; local branches resynced). Smoke-tested on staging incl. live Partial-mode Truckstop search. 171 unit tests pass; build clean; still 12 serverless functions.

Items 001–009 are now **all in production**. Remaining open threads are infra-gated, not code: (1) Vercel Pro → true server-side 15-min auto-refresh (006) + cron auto-finish (008); (2) 007 full mode filtering (only Full/Partial map to Truckstop `LoadType` today).

- **AI cleanup:** Removed the per-result **Financial Summary** block from v1 `BackhaulResults` + v2 `SearchView` (redundant now that the Financial Breakdown sits above each card and the $0-load Negotiate button handles no-rate loads). Replaced the stale **"Ask AI"** FAQ with a **Negotiate** FAQ and dropped the "improve AI recommendations over time" clause from the Haul FAQ (v1 `HelpPage` + v2 `HelpView`).

- **007 (ENHANCE — Mode field):** Optional multi-select **Modes** (Truck Load, LTL, Intermodal, Partial, Drayage, Parcel, Air, Water, Ocean) at the fleet-profile level, next to Equipment Variation (v1 `FleetSetup`, v2 `FleetsView` ProfileTab). New `fleet_profiles.modes TEXT[]` (migration `20260531000001`, applied to staging; prod on promotion). Threads into the Truckstop SOAP call: `modes` flows fleet → `requestContext` → `getLoadsForMatching` → `[provider].js` → `buildSoapEnvelope`, mapping onto the `<LoadType>` enum via `deriveLoadType` (none→Full, Partial→Partial, both→All). Wired through all 4 consumers: Search, Estimates, WWP (v1+v2). 3 new unit tests.
  - **⚠️ Known limit:** only Full/Partial are expressible in the LoadSearch Criteria — the other modes (Intermodal/Drayage/Parcel/Air/Water/Ocean) are captured at fleet level but **not** sent as a server filter. Ryder's priority (Partial) is covered. **Chip must validate the `LoadType` enum values (esp. `All`) against the live Truckstop API** — invalid filters have silently broken searches before.

- **008 (FIX/ENHANCE — Haul + keep searching):** Haul-confirm dialogs now have a **"Keep checking for matching loads"** checkbox (v1 `BackhaulResults`, v2 `SearchView`).
  - Unchecked (final load) → `status: completed` + `auto_refresh: false` (no further credits). Counts on the dashboard.
  - Checked (keep looking) → interim `status: in_progress`, auto-refresh stays on, records the picked load but `completed_at: null`. **Option A**: only `completed` requests count on the dashboard (already filtered there), so an `in_progress` haul counts exactly once when finalized.
  - Cron + `getActiveAutoRefresh` now match `['active','in_progress']` so in_progress keeps refreshing. 006 max-refresh cap still applies.
  - Lists/badges: `in_progress` bucketed as Active in both UIs ("◐ Load picked — searching" v1, "Searching" v2).
  - **Finish action:** manual "Finish & keep load" button on in_progress requests (v1 detail header, v2 request card) → completes + turns off auto-refresh, preserving the hauled load/revenue. Closes the gap where Cancel would've lost the credit.
  - **Auto-finish:** in_progress requests past their `equipment_needed_date` auto-complete (keep load+revenue, auto-refresh off). Primary mechanism is a **client-side sweep on request load** (the periodic cron isn't scheduled on Hobby — see [[project_auto_refresh_cron_limit]]); same guard also added to the cron for when Vercel Pro lands. Shared, tested util `autoFinishRequests.js` (9 tests).

- **009-P2 (FIX — redo):** Yesterday's z-index bump (1000→2000) didn't fix the mobile WWP plan sidebar X being covered by the avatar — the modal was nested in an isolating **stacking context**, so its z-index never competed against the app-chrome avatar. Real fix: render `PlanDetailModal` via a **React portal to `document.body`** (`createPortal`), escaping all ancestor stacking contexts. Fixes both mount points (WWP view + dashboard widget); X now behaves the same desktop vs mobile. **Needs a device check** (mobile stacking, not exercisable locally).

---

## What Was Just Completed (May 30, 2026, session 6) — staging-test follow-up fixes

Continued smoke-testing batch 2 on staging. 001, 003, 004, 005 all verified good. Two bugs found and fixed; pushed to staging.

- **002 (FIX — stale typo error):** The "We couldn't find that location — check the spelling." warning stayed visible even after a later verify succeeded (v2 also showed the green "✓ Location verified" line at the same time). Cause: the parent set the error in `validate()` but never cleared it when `onResolve` later returned valid coords. Fix: clear the datum error on successful resolve in both v2 `SearchView` (`handleDatumResolve`) and v1 `StartRequest` (`onResolve`). The earlier 13th-function Vercel build bug from 002 was already fixed in commit `04b9b3a` (suggest merged into `geocode.js?suggest=1`).
- **009-P2 (FIX — WWP mobile):** On mobile, the X to close the Work Week Plan detail popup was covered by the avatar/user menu. Cause: `PlanDetailModal` rendered at `zIndex: 1000`, below the avatar button (`Shell.jsx` zIndex 1100) and its popover (1200). Fix: bumped the modal to `zIndex: 2000`, matching every other full-screen v2 modal. v2-only (no v1 WWP plan modal).
- **002 (FIX — fleet home verify error, follow-up):** Same class as the datum bug but on the fleet-home address path. The top-level error banner was set on a failed save/verify but never cleared when a later geocode succeeded — so the red banner stayed next to the green "✓ Verified" + coordinates. Fix: clear the error banner on successful verify in v1 `FleetSetup` (`handleHomeCityStateBlur`) and v2 `FleetsView` ProfileTab (`handleGeocode`).
- **006-P1 (ENHANCE — auto-refresh cadence + cap):** Added a **15-minute** interval option (0.25h; 4 credits/hr) and an optional **"Stop after N refreshes"** cap that self-disables auto-refresh. New columns `max_auto_refreshes` (null = unlimited) + `auto_refresh_count` on `backhaul_requests` (migration `20260530000001`, applied to staging; prod applies on promotion). Wired through v1 (`StartRequest` form/save, `OpenRequests` polling) and v2 (`SearchView` form/polling, shared `buildRequestPayload`) plus the server cron (`refresh-requests.js` increments count + flips `auto_refresh=false` at the cap). Counter resets to 0 on every save. 5 new unit tests on the cap logic.
  - **⚠️ Vercel Pro dependency:** true *server-side* 15-min cadence needs Vercel Pro — Hobby crons run at most daily, and the periodic refresh isn't even scheduled in `vercel.json` yet. Today auto-refresh only fires client-side while the tab is open. The cap logic is in the cron and ready for when Pro lands.

- **002 (FIX — edit-request false typo error, follow-up):** Editing an existing v2 backhaul request and changing only another field (e.g. the new "Stop after") failed validation with "We couldn't find that location," even though the saved city/state was valid. Cause: v2 `SearchView` seeded `datumVerified` from `datum_lat`, which is null for any request created in v1 (v1's save never stored coords) or predating that column — so a valid saved datum started "unverified." Fix: also seed from `datum_point` (always set on save). Untouched datum passes on edit; editing the field still flips it off and re-verifies on blur. v2-only (v1's `datumResolved` already starts lenient/null).

All 159 unit tests pass; production build clean. PR #17 (001–006, 009-P2 + 002 fixes) merged to main; migration `20260530000001` applied to production. The edit-request fix above is the only item still ahead of main on `staging`.

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
- **All-P3 backlog** — #78 (LinkedIn/founder schema), #77 (mobile app discussion), #45 (Edge browser awareness), #31 (negotiation option-3), #30 (full mode filtering + LoadType enum validation by Chip).
- **Waiting on Chip's feedback** on Work Week Planning results quality + new load card fields (credit, email, appt times, special instructions).
- **Remove `[WWP]` debug logging** from algorithm once Chip validates.
- **Crisp chat** — uncomment `CrispChat` in App.jsx + AppV2.jsx and the button in HelpView.jsx when ready to launch.
- **Zip-code geocoding** — `pickup_zip` and `delivery_zip` are now captured; could replace state-centroid map markers with more accurate positions.

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
- Truckstop integration-ID **rotation** — deferred/accepted by Chip (#86 closed); ID itself now lives in Vault.
- Relay-mode math + distance numbers — pending Chip validation against live PC*MILER.
- WWP algorithm quality — pending Chip validation.
- Truckstop `LoadType` enum (esp. `All`) — Chip must validate against the live API (#30).

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

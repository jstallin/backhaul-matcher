# Haul Monitor — Current Status

> Update this file at the end of every Claude.ai or Claude Code session.
> Share with the other Claude at the start of the next session.

---

## Last Updated
- **Date:** May 25, 2026
- **Session type:** Claude.ai (planning + build)
- **Updated by:** Jason

---

## Roadmap Status

| # | Item | Status |
|---|------|--------|
| 1 | Claude sync (Claude.ai ↔ Claude Code) | ✅ Done |
| 2 | Staging environment | ✅ Done |
| 3 | Test suite expansion | ✅ Done (initial pass) |
| 4 | Chip's dedicated fleet feature | 🔶 Spec complete, awaiting Chip sign-off |
| 5 | Claude efficiency / multi-agent | 🔶 In progress — STATUS.md workflow being established |
| 6 | Infrastructure paid tiers | ⏳ Blocked — awaiting corporate card |

---

## What Was Just Completed
- Created `staging` branch in GitHub
- Created staging Vercel project tracking `staging` branch
- Configured staging Supabase project (`haul-monitor-staging`, ID: `vdrkpitooqgmmlfrbphi`)
- Updated `.github/workflows/test.yml` to support staging branch + dynamic Playwright URLs
- Added GitHub Actions secrets for staging Supabase credentials
- Fixed `auth.setup.js` to gracefully skip when TEST_EMAIL/TEST_PASSWORD not set
- Added Vitest unit tests for `calculateDistance` and `calculateNetRevenue` (32 tests)
- Updated `CLAUDE.md` with staging details, UX version clarification, infrastructure status
- Created `docs/specs/dedicated-fleet-planning.md` (Draft 2, pending Chip sign-off)
- Established STATUS.md workflow as Claude.ai ↔ Claude Code sync bridge

---

## In Progress / Next Up
- Waiting on Chip sign-off on dedicated fleet spec before starting #4 implementation
- Corporate card arriving soon — upgrade Supabase + Vercel to paid tiers before pilots go live
- Pilots starting this week or next (1-2 customers)

---

## Key Decisions Made This Session
- CLAUDE.md is the persistent technical context bridge between Claude.ai and Claude Code
- STATUS.md is the living current-state doc, updated each session and shared across both
- Staging workflow: feature branch → PR to staging → CI → merge to staging → PR to main → production
- Playwright authenticated tests deferred until proper auth flow is built out (item #3 follow-up)
- Supabase legacy anon/service_role keys used in staging (consistent with production)
- Both v1 and v2 UX must be supported — neither is deprecated

---

## Open Questions / Blockers
- Chip sign-off on dedicated fleet spec
- Corporate card for Supabase Pro + Vercel Pro upgrades
- Staging custom domain (`staging.haulmonitor.cloud`) — deferred, not urgent
- Authenticated Playwright tests need proper auth flow implementation

---

## Pilots
- 1-2 pilot customers starting this week or next
- First pilot confirmed: has valid Truckstop integration ID
- Production stability is top priority during pilot period

---

## Quick Reference — Key URLs
- Production: `https://haulmonitor.cloud/app`
- Staging: `https://backhaul-matcher-staging.vercel.app`
- Repo: `https://github.com/jstallin/backhaul-matcher`
- Staging Supabase: `https://vdrkpitooqgmmlfrbphi.supabase.co`


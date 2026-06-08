# Haul Monitor — Infra Account Ownership Transfer Runbook

**Goal:** Move all primary infrastructure accounts from a founder's personal Gmail to a company-domain identity owned by the LLC, with both founders holding access. Reduces bus-factor risk today and removes a diligence flag for any future acquisition.

**Who:** Jason + Chip, together, in one sitting.
**Do NOT automate any of this.** Every step is account creation, ownership transfer, or credential entry — human-at-keyboard work, not an agent task.

---

## Sequencing logic (read first)

The order matters for one reason: **moving the GitHub repo to a new namespace breaks the Supabase auto-migration link and the Vercel deploy link.** So the order is deliberately:

1. Establish a company identity (domain → Workspace) — everything else hangs off this.
2. Move GitHub — knowing it will break the two integration hooks.
3. Immediately re-link Supabase + Vercel to the moved repo (close the broken window fast).
4. Transfer ownership of the remaining services to the company identity.
5. Verify everything end-to-end, then remove personal ownership.

Don't reorder these without understanding the dependency.

---

## Phase 0 — Pre-flight (don't skip)

- [ ] **Pick a low-traffic window.** The pilot is live; do this when Ryder isn't mid-workflow (weekend evening is ideal). Tell Chip the window.
- [ ] **Both founders available** for the whole session — several steps need a second owner added live.
- [ ] **Create a shared company password vault** (1Password/Bitwarden, billed to the LLC) *first*. The role-account credentials and recovery codes live here, accessible to both founders.
- [ ] **Inventory every account** and note, for each: current owner email, where billing points, and where DNS/domain is managed. Use the service list in Phase 5 as your checklist.
- [ ] **Confirm a clean restore point.** Supabase PITR is on (Pro) — verify a recent restore point exists. Git is distributed, so the repo itself is safe regardless.
- [ ] **Decide your role address.** Use a *role* mailbox, not a person: `infra@haulmonitor.cloud` or `ops@haulmonitor.cloud`. This is the durable point — it survives either founder leaving. Never make `jason@` the owner of record.

---

## Phase 1 — Foundational identity

- [ ] **Domain registrar.** Confirm `haulmonitor.cloud` is registered under company control (or transfer it). This is the root of trust for company email and every domain verification downstream — if it's under a personal registrar login, fix that here. Note where DNS records are managed (registrar vs. Vercel vs. elsewhere); you'll need it for Workspace MX records.
- [ ] **Google Workspace** on `haulmonitor.cloud`. Create the role mailbox(es) from Phase 0. Add Jason + Chip as admins. Set up MFA, and set **recovery to both founders** — not a single personal phone. This single account becomes the identity for everything Google-related (Search Console etc.) and the owner-of-record email for the services below.

---

## Phase 2 — GitHub (the IP core, and the domino)

The repo is currently `jstallin/backhaul-matcher` — a personal namespace. That's the highest-priority fix and the one a buyer's engineers notice first.

- [ ] **Create a GitHub Organization** owned by the company identity; point org billing at the LLC.
- [ ] **Add Jason + Chip as Org Owners.** (This is the real bus-factor fix.)
- [ ] **Transfer the repo** into the org.
- [ ] **Verify after transfer:**
  - [ ] Branch protection on `main` survived (it was set in `90c1322` — re-apply if it didn't carry).
  - [ ] Actions secrets are present (repo-level secrets travel with a transfer, but confirm).
  - [ ] Workflows intact — `whats-new.yml`, the CI suite, Playwright.
- [ ] **Update local git remotes on both machines:** `git remote set-url origin <new-org-url>`.
- [ ] **Know:** you just broke the Supabase auto-migration hook and the Vercel deploy hook → go straight to Phase 3.

> While you're in the GitHub workflows: the **Node 20 runner deprecation lands June 16**. Bump `actions/checkout@v4`, `setup-node@v4`, `cache@v4`, `upload-artifact@v4` now, in the same session — it's a one-line-per-workflow change and it'll fail CI if it slips.

---

## Phase 3 — Re-link the broken integrations (immediately)

- [ ] **Vercel ↔ Git.** Reconnect the project's Git integration to the new org/repo. Push a trivial commit and confirm a deploy fires and CI gating still works.
- [ ] **Supabase ↔ GitHub.** Reconnect the integration so migrations auto-apply on merge again. Confirm `supabase migration list` shows local = remote on **both** prod (`cxvmkvhwqktkktczpuyk`) and staging (`vdrkpitooqgmmlfrbphi`), then run a no-op migration PR to confirm the pipeline end-to-end.
- [ ] **Better Stack monitors.** Unaffected by the repo move, but verify they still hit the public health endpoints (`/api/pcmiler/health`, `/api/integrations/health`) and are green.

---

## Phase 4 — Transfer service ownership (Supabase + Vercel)

This is the *ownership/billing identity* transfer, separate from the Git links you just re-established. Do one at a time, smoke-test between.

- [ ] **Supabase.** Move the project into a company-owned organization; point billing at the LLC. Verify both projects still healthy after the move.
- [ ] **Vercel.** Move the project into a company-owned Team; point billing at the LLC. **Verify env vars and custom domains carried over** — these are the things most likely to need re-checking after a project move. Confirm `haulmonitor.cloud` + `staging.haulmonitor.cloud` still resolve and deploy.

---

## Phase 5 — Remaining services

Each: company identity as owner of record, LLC billing. Work the list:

- [ ] **Resend** — verify the domain-sending DNS records are still valid under the Workspace/registrar setup from Phase 1.
- [ ] **Twilio** — ⚠️ **do this one LAST, or after the toll-free number clears approval.** Changing the account identity mid-approval risks resetting or complicating the toll-free application. Don't disrupt an in-flight approval to chase tidy ownership; sequence around it.
- [ ] **Stripe** (live + test) — if the account ownership identity changes, watch for API key rotation; if keys change, update them in the Vercel env immediately or checkout breaks.
- [ ] **PC\*MILER / Trimble** and **Truckstop** — company identity. These two double as *the contracts a buyer scrutinizes hardest* (your routing + load-board partnerships), so getting the account holder onto the company identity does real diligence-readiness work, not just convenience. Note any change-of-control/assignment terms while you're in there.
- [ ] **Google Search Console** + any other Google properties — now live under the Workspace identity.
- [ ] **DirectFreight** (scraper/transitional) — lower priority; fold in when convenient.

---

## Phase 6 — Verify, then lock down

- [ ] **Full smoke test:** deploy fires on push → CI gates → merge → migration auto-applies → cron fires → prod + staging healthy → buy-credits checkout works.
- [ ] **Both founders can independently log into every service.** Confirm before the next step.
- [ ] **Only now**, downgrade/remove the personal Gmail as owner where a company owner is confirmed in place. Don't orphan yourself mid-process — company access must be verified first.
- [ ] **Record everything** in an `ACCESS.md` (or the password vault): each service's owner-of-record, billing source, recovery contacts, and which integrations were re-linked. This is the same transferability infrastructure your STATUS.md/CLAUDE.md discipline already represents — keep it current.
- [ ] **Re-point any Claude.ai MCP connectors** (Google Drive/Calendar/Gmail) if those moved to the Workspace identity.

---

## Notes

- **Keep paying from the LLC Wells Fargo account** — that part is already right. Just route billing receipts to the company address so identity and bookkeeping line up.
- Exact in-product steps (menu paths, button labels) change over time per provider. This runbook gives the order and the gotchas; follow each provider's *current* transfer flow for the precise clicks. If you want click-level detail for any specific service, ask and I'll pull up that provider's current docs.

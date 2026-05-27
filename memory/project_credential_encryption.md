---
name: project-credential-encryption
description: Truckstop credential encryption plan — deferred to Supabase Pro upgrade
metadata:
  type: project
---

The **Truckstop integration ID** (per-org, entered via Fleet Setup) is stored in plaintext in `user_integrations.metadata`. This is the only org-level credential — it identifies the org's Truckstop account to Haul Monitor's API call.

Truckstop username/password are Haul Monitor's own credentials, stored as Vercel env vars. They are NOT per-org and NOT stored in the DB.

**Decision (2026-05-27):** Accepted as-is for the pilot phase. Will encrypt the integration ID using Supabase Vault once upgraded to Supabase Pro.

**Why:** Pilot is a controlled rollout with known customers. Supabase Pro upgrade is already planned — just needs the corporate card and a button click.

**How to apply:** Do not build a custom AES serverless encryption layer. When the Pro upgrade happens, implement Supabase Vault for the integration ID and migrate existing plaintext values at that time.

**Hard limit:** Must be resolved before onboarding any carrier beyond the current pilot.

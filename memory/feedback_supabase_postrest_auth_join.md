---
name: feedback-supabase-postrest-auth-join
description: PostgREST cannot join to auth.users via foreign key — use auth.admin.getUserById instead
metadata:
  type: feedback
---

Do NOT use PostgREST join syntax to traverse FKs into `auth.users` (e.g. `invited_by_profile:invited_by(...)`). PostgREST can't access the `auth` schema, so the query silently fails with an error that bubbles up as a generic 404.

**Why:** Discovered when `handleInviteToken` in `api/orgs/[action].js` was returning "Invite not found" for valid tokens — the broken join was causing a PostgREST error on every lookup.

**How to apply:** Always fetch auth user details via `supabase.auth.admin.getUserById(uuid)` in serverless functions. The select query should only join to tables in the `public` schema.

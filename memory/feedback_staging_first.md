---
name: feedback-staging-first
description: Always apply DB changes to staging Supabase before production, even for benign operations like schema cache reloads
metadata:
  type: feedback
---

Always target staging Supabase (project ID: `vdrkpitooqgmmlfrbphi`) before production (`cxvmkvhwqktkktczpuyk`) for any database operation — including benign ones like `NOTIFY pgrst, 'reload schema'`.

**Why:** User explicitly corrected this when I ran a schema cache reload on production directly instead of staging first. The staging-first rule applies to all DB operations, not just migrations.

**How to apply:** When debugging a Supabase error, always ask "which environment is this in?" before touching any Supabase project. Default to staging project ID unless the user confirms they're testing production.

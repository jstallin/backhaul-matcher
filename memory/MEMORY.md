# Backhaul Matcher - Project Memory

- [Zero-Copy Architecture Direction](project_zero_copy_architecture.md) — strategic decision to be a real-time intelligence layer, not a data aggregator
- [AIM Integration](project_aim_integration.md) — pending agreement → DAT/Truckstop as production load sources; DF becomes testing-only
- [SOC 2 Readiness](reference_uptime_status.md) — self-assessment in progress; Better Uptime status page live
- [v2 UI Switchover Plan](project_v2_switchover.md) — when switching v2 to default: update user guide screenshots + update tests
- [PostgREST auth.users join fails](feedback_supabase_postrest_auth_join.md) — never join to auth.users via PostgREST; use auth.admin.getUserById in serverless functions
- [Vercel SPA routes need explicit rewrites](feedback_vercel_spa_routes.md) — every new client-side route needs an entry in vercel.json rewrites
- [Trimble Actuals Report](project_trimble_actuals_report.md) — monthly hauled-load report for PC*MILER billing; Admin Dashboard live view + 1st-of-month Resend email to admins; currently at 12-function Vercel limit
- [Staging First Rule](feedback_staging_first.md) — always target staging Supabase before production, even for benign ops like schema cache reloads
- [Credential Encryption Plan](project_credential_encryption.md) — Truckstop creds plaintext in pilot; Supabase Vault on Pro upgrade; must fix before scaling beyond pilot

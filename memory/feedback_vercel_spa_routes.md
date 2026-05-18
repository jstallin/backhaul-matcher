---
name: feedback-vercel-spa-routes
description: Every SPA route must have an explicit rewrite entry in vercel.json or it 404s
metadata:
  type: feedback
---

This app uses a custom entry point (`app.html`, not `index.html`). Vercel does not automatically fall back to `app.html` for unknown paths — every client-side route needs an explicit entry in the `rewrites` array in `vercel.json`.

**Why:** `/accept-invite` returned a 404 in production until added. `/reset-password` and `/app` already had entries; new routes are easy to miss.

**How to apply:** Any time a new top-level client-side route is added (e.g. `/onboarding`, `/accept-invite`), add `{ "source": "/that-route", "destination": "/app.html" }` to `vercel.json` at the same time.

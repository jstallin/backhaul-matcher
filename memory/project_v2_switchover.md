---
name: v2 UI Switchover Plan
description: What needs to happen when the team decides to make v2 the default UI
type: project
---

v2 redesign ("Haul Monitor" — dark sidebar, light cards, Inter font) is complete and deployed behind the `hm_ui=v2` localStorage flag. Admins can toggle it on/off in Settings → Developer tab in either UI.

**Why:** Being tested internally before switching over as the default.

**Current status (May 2026):** Deployed for internal testing. Chip is reviewing. Key recent fixes:
- Backhaul load markers now plot on map (state-centroid fallback for DF loads with null coordinates)
- Avatar popup z-index raised above Leaflet map layers
- Mobile layout: bottom tab bar replaces sidebar on <768px; SearchView has master-detail navigation on mobile

**When switching over, three things to do:**
1. **User guide** — needs screenshots and copy updated to reflect v2 UI (navigation, card layouts, new Search results view, Co-driver panel, mobile layout).
2. **Tests** — need updating to match v2 component structure and selectors.
3. **Migration** — remove `hm_ui` localStorage flag, make v2 the default render path in `src/main.jsx` or `src/App.jsx`.

**How to apply:** When the user says they're ready to make v2 the default, remind them of these three items and ask which to tackle first. Wait for Chip's feedback before starting.

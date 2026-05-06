---
name: v2 UI Switchover Plan
description: What needs to happen when the team decides to make v2 the default UI
type: project
---

v2 redesign ("Haul Monitor" — dark sidebar, light cards, Inter font) is complete and deployed behind the `hm_ui=v2` localStorage flag. Admins can toggle it on/off in Settings → Developer tab in either UI.

**Why:** Being tested internally before switching over as the default.

**When switching over, two things to do:**
1. **User guide** — needs screenshots and copy updated to reflect v2 UI (navigation, card layouts, new Search results view, Co-driver panel). Guide has been recently updated (email images as of May 2026).
2. **Tests** — need updating to match v2 component structure and selectors.

**How to apply:** When the user says they're ready to make v2 the default, remind them of these two items and ask which to tackle first.

# Demo Reel Script — Tab Organizer (30s, dark mode, no voiceover)

**Goal:** Show the problem (tab chaos) → solution (search, group, collect) in one breath. No real data, fake titles that look real. 8-10 tabs, slow enough to read.

**Pacing:** 2-3s per beat, total ~30s. No fast flips. Each action: problem → click → result, hold for a beat.

---

### Beat 1 — Hook (0-4s)
**Visual:** Dark mode dashboard, 10 tabs open, messy. Header: "10 tabs". Sidebar: All Tabs (10), Work (4), Ungrouped (6). Grid: GitHub, Figma, Linear, Notion, etc., some pinned.
**Text overlay:** "20 tabs open? Find anything?"
**Action:** None — let viewer feel the chaos. Hold 3s.

### Beat 2 — Search (4-10s)
**Visual:** Cursor clicks search bar, types "Figma" slowly.
**Result:** Grid filters to 1 card ("Figma — Design System") with highlight. Tab count stays 10 (filter, not delete).
**Text overlay:** "Search by title, URL, or group"
**Hold:** 2s on filtered result.

### Beat 3 — Select & Group (10-18s)
**Visual:** Clear search. Checkboxes appear on hover. Click 2 checkboxes (GitHub, Claude Docs). Selection bar fades in: "2 selected". Click "Group" → modal opens ("New Group", color dots). Type "Research", pick blue. Create.
**Result:** Toast "Group 'Research' created", grid updates with blue indicator on those 2 cards, sidebar adds "Research (2)".
**Text overlay:** "Group in one click"
**Hold:** 2s on grouped state.

### Beat 4 — Save Collection (18-25s)
**Visual:** Select 3 tabs (Figma, Linear, Notion). Click "Save Collection" → modal. Type "Q4 Planning", description "Sprint links". Save.
**Result:** Toast "Collection 'Q4 Planning' saved", sidebar adds "Q4 Planning (3)".
**Text overlay:** "Save any set — reopen anytime"
**Hold:** 2s.

### Beat 5 — Dark Mode & Polish (25-30s)
**Visual:** Click Settings (gear) → dark mode already on (show toggle checked). Close. Show full organized grid: groups with colors, collections in sidebar, clean. Hold.
**Text overlay:** "Works in dark mode. Your tabs, tamed."
**End card:** Logo + "Get Tab Organizer — Chrome Web Store" (2s).

---

**Recording notes:**
- Dark mode: `document.documentElement.setAttribute('data-theme','dark')` before capture.
- Tabs: 8-10, mix of pinned, grouped, ungrouped. Favicons as 📄 placeholders.
- Speed: `delay: 120ms` typing, `wait: 1200ms` between beats. No 500ms flips.
- No voiceover, just text overlays (GitHub README autoplays GIF/MP4 silently).
- Export: 1280x800, 2 fps, muted, loop once.

**What we skip:** Real Gmail data, fast AI demo (needs key), drag-and-drop (subtle). Keep to search → group → collect (the core loop).

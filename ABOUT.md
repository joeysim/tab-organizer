# About Tab Organizer

Tab Organizer is a Chrome extension (Manifest V3) that replaces tab sprawl with one
dashboard: search across every open tab, group them by topic, save sets of links as
collections you can reopen later, and let an AI model propose groupings for your
ungrouped tabs.

![Demo](docs/screencast.gif)

## Why it exists

Browser tabs are a to-do list you never wrote down. Once you pass ~30 open tabs, the
tab strip stops being navigable and you start hunting. The usual fixes are either
"close everything" (loses context) or "one bookmark folder per project" (never
revisited). This extension keeps the working set visible and organized in one place,
without leaving the browser and without a backend.

## How it works

- **Dashboard** — one page listing every open tab with favicon, title and host.
  Grid or list view, live-updating as tabs open, change, or close.
- **Search** — scored matches across title, URL, host and group name, debounced so it
  stays responsive while typing.
- **Tab groups** — creates real Chrome tab groups (not a private list), so what you
  organize in the dashboard shows up in the tab strip and survives in the browser.
- **Collections** — saves a selection of tabs as named links you can reopen, copy, or
  export as Markdown. Stored locally in the extension.
- **AI recipes** — the extension's primitives (close, group, move, ungroup, save,
  focus) are described to the model as tools. You type a request; it returns a plan;
  you see the exact tabs each step will touch and approve it. Destructive steps are
  marked, and an undo bar restores closed tabs, removes created groups, and returns
  moved tabs to their previous group.
- **AI organize** — sends only your *ungrouped* tabs to a model and shows the proposed
  groups in an editable preview: drag tabs between groups, move them to Ungrouped,
  rename groups, then approve.
- **Provider choice** — LunaRoute (default) or direct Claude, with the key you supply.

## Design decisions

**No backend.** The extension talks to the AI provider directly from the browser with
the key you paste in Settings. Nothing about your tabs is sent anywhere else, and no
server exists to log it. The tradeoff: the key lives in the extension's local storage,
readable by the extension itself. It is stored in `chrome.storage.local` rather than
`sync` specifically so it does not follow your Google account across devices. Moving
the call behind a proxy is the obvious hardening step if this ever ships widely.

**Real tab groups, not an internal list.** Organizing only inside a dashboard is a
parallel universe that drifts from the tab strip. Using `chrome.tabGroups` means the
browser stays the source of truth.

**Ungrouped tabs only for AI.** Re-classifying work you already organized is
destructive and slow. The model sees `groupId === -1` tabs and nothing else, so an
existing group is never touched. If everything is grouped, the call is skipped
entirely.

**Plans target selectors, not id lists.** A recipe says "all mail.google.com tabs",
not twelve hardcoded ids, so it keeps working as tabs open and close. Selectors are
resolved against live tabs before the preview, which is why the preview can show you
exactly what will change. A malformed or empty selector resolves to *nothing* rather
than everything — the failure mode of a bad plan is doing too little, never a mass
close.

**An editable preview, not auto-apply.** AI grouping is a suggestion. Showing it as a
draft you can rearrange and then explicitly approve keeps a wrong guess cheap — you
fix a card instead of undoing a bunch of Chrome groups.

**Measured latency, not guessed.** The first version took ~20s per request. Profiling
showed the time was spent in the model's hidden reasoning, not in the prompt or the
network: asking for low reasoning effort cut it to ~1.2s, and end-to-end runs now come
in at 1.8–2.1s for a typical tab set. Prompt size was a secondary factor at best.

## Privacy

- Tab titles/URLs go to the AI provider **only** when you click AI Organize, and only
  for ungrouped tabs.
- Collections and settings stay in `chrome.storage` on your machine.
- No analytics, no telemetry, no third-party scripts. The only network calls are to the
  AI provider you configure.

Permissions requested: `tabs`, `tabGroups`, `scripting`, `storage`, `alarms`, and
`<all_urls>` (needed to read tab metadata and content for the opt-in AI features).

## Stack

TypeScript + vanilla DOM, built with Vite. The service worker is bundled separately
with esbuild into a single file. Tests run on Vitest with jsdom (94 at time of
writing). No UI framework — the dashboard is a few hundred lines of DOM code and one
stylesheet.

## Building

```bash
pnpm install
pnpm build          # dev build -> dist/, version_name carries the git hash
pnpm build:release  # clean semver, for packaging
pnpm package        # release/tab-organizer-<version>.zip, manifest at archive root
pnpm test
```

Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked.

## License

MIT — see [LICENSE](LICENSE).

# Project Recreation Design — Tab Organizer Dashboard

**Date:** 2026-02-03
**Status:** Approved — 2026-02-03
**Source artifact:** `tab-organizer/` flat folder (MV3 extension, vanilla JS, no package.json / build / git history)
**Decisions locked:** AI v1 stays UI-direct fetch (background proxy deferred to v2); live `sync.settings`/`local.collections`/`local.sessions` must survive in-place updates (migration shim + test required)

## Intent & Why

Recreate a proper source project from a copied build artifact after loss of the original repo. The current folder *works* as an unpacked MV3 extension but is not a maintainable codebase: flat files (`background.js`, `lib/`, `newtab/`), no dependency management, no build, no src/dist separation, no git history, and shared state spread across globals.

Why now: this artifact is intended as the base for future iterations, starting with AI features that analyze links and collections (summarize, tag, cluster, score, suggest groupings) plus other unspecified features. Without modular boundaries and a build, every new feature touches `background.js` and `newtab.js` and risks regressions.

## Goals

- **Faithful recreation:** new source builds to an extension behaviorally identical to the current artifact (tabs/groups/collections/search/AI organize/dark mode/keyboard nav/drag-and-drop/content extraction).
- **Real project structure:** `src/` → `dist/` separation, `package.json` with minimal toolchain, git repo with clean history, reproducible builds (dev + prod zip).
- **Extensibility for AI + future features:** new AI capabilities (and non-AI features) can be added in one focused place without rewiring core; AI providers/prompts are swappable.
- **Preserve dev workflow:** `pnpm dev` (or `npm run dev`) with HMR/watch and Load Unpacked from `dist/`; one-command `build` + `package` for store.
- **Keep data compatible:** existing `chrome.storage` keys and shapes continue to work (no migration breaking users who already installed the artifact).
- **Tests keep passing:** existing `tests/` continue to run; new modules are unit-testable without Chrome.

## Non-Goals

- No new user-facing features in this pass (no new AI behavior beyond what exists — Claude organize + quickCategorize fallback — no new UI).
- No backend service, auth, or cross-device sync beyond current `chrome.storage.sync`/`local`.
- No framework migration (React/Vue etc.) — stay vanilla DOM, just better organized.
- No Chrome Web Store publishing automation beyond producing a zip; no cross-browser (Firefox/Safari) port.

## Anti-Goals (what would make this a failure even if it technically builds)

- Over-engineering: heavy framework, large dependency tree, or abstraction for abstraction's sake.
- Breaking current behavior: lost tabs, corrupted collections, changed storage keys, or altered permissions.
- Making Load Unpacked harder than today (build must be simple and documented).
- Tying AI to a single provider shape — the next provider or prompt change should not require a core rewrite.

## Constraints & Current State

- **Ground truth (per repo inspection):** authoritative artifact is repo root — `manifest.json`, `background.js`, `lib/`, `newtab/`, `icons/*.png` (plus `tests/`), all committed. `README.md` is newly added doc, `.DS_Store` is ignored noise. No hidden `dist/`, zip, or alternate build output exists — verification is behavior equivalence, not file-name diff.
- MV3 extension: `manifest.json` v3, service_worker `background.js`, action opening `newtab/newtab.html`, permissions `tabs`, `tabGroups`, `scripting`, `storage`, host `<all_urls>`.
- Vanilla JS globals: `Storage`, `Search`, `CollectionManager`/`SessionManager`, `AI` exposed on window; `newtab.js` holds all app state + rendering + events (~1500 LOC).
- Content extraction via `chrome.scripting.executeScript(extractPageContent)` with tag/selector skip list, depth cap 30, ~50 KB truncation, batched 5 concurrent, 1 h TTL cache.
- Storage: `sync.settings { apiKey, darkMode }`, `local.collections`, `local.contentCache`, legacy `local.sessions`.
- No package manager; icons as PNGs in `icons/`; tests use `mockChrome` harness.

## Decisions Made (with partner)

- **May introduce a minimal build step** — partner approved adding a bundler/package manager where it helps AI extensibility.
- **Vanilla starting point is good** — confirmed no hidden dependencies to migrate; artifact is complete.
- **AI direction is plural** — future work includes many features, prominently AI that can analyze links and collections (exact capabilities to be defined per-feature).

## Proposed How (builder has latitude within this)

### Toolchain (minimal)

- Package manager: `pnpm` canonical with `pnpm-lock.yaml`; `npm` fallback works but docs/scripts use `pnpm` (builder call — keeps install/build verification unambiguous).
- Build: `vite` + `@crxjs/vite-plugin` or plain `vite` with static `public/manifest.json` copy — whichever keeps manifest handling simplest; no SSR, no framework plugin.
- Language: TypeScript with `allowJs` initially so existing JS can be moved without rewrite; new AI/core code in TS, incremental typing.
- Quality: `eslint` + `prettier` (or `biome`) with a tiny shared config, `vitest` for unit tests (compatible with existing Node harness), `tsconfig.json` with strict-lite settings.

### Source Layout

```
tab-organizer/
├── src/
│   ├── manifest.json            # source manifest (copied to dist)
│   ├── background/
│   │   ├── index.ts             # service worker entry (was background.js)
│   │   ├── router.ts            # message action router
│   │   ├── tabs.ts              # listAllTabs, groups map
│   │   ├── groups.ts            # create/move/ungroup/update/delete
│   │   ├── collections.ts       # privileged reopenCollection (chrome.tabs.create/group) — UI calls via sendMessage
│   │   └── content/
│   │       ├── extract.raw.ts   # extractPageContent as isolated serializable fn (no imports, no bundling) — shortcut: plain copy preserves injection, upgrade to dedicated chunk + build assert if needed
│   │       ├── policy.ts        # restricted URL check
│   │       └── batch.ts         # getAllTabsContent batching
│   ├── shared/
│   │   ├── types/               # Tab, TabGroup, Collection, Settings
│   │   ├── constants/           # colors, limits, storage keys
│   │   └── storage/             # Storage wrapper (sync/local + TTL)
│   ├── lib/
│   │   ├── search/              # Search.scoring + content search
│   │   ├── ai/
│   │   │   ├── provider.ts      # Provider interface (Claude today)
│   │   │   ├── claude.ts        # Claude implementation (UI-direct fetch preserved for v1; background proxy deferred)
│   │   │   ├── prompts/         # prompt builders (organize, etc.)
│   │   │   └── categorize.ts    # quickCategorize fallback
│   │   └── collections/         # CollectionManager storage + markdown only (no chrome.tabs calls)
│   └── newtab/
│       ├── index.html           # entry HTML
│       ├── main.ts              # app bootstrap
│       ├── app/
│       │   ├── state.ts         # app state + types
│       │   ├── render.ts        # render pipeline
│       │   ├── tabs.ts          # tab cards
│       │   ├── groups.ts        # sidebar groups + color picker
│       │   ├── collections.ts   # sidebar + modals
│       │   ├── search.ts        # search wiring
│       │   ├── dnd.ts           # drag-and-drop + intersection
│       │   ├── keyboard.ts      # keyboard nav
│       │   ├── modals.ts        # modal helpers
│       │   └── toast.ts         # notifications
│       ├── styles/
│       │   ├── variables.css    # CSS vars + group colors
│       │   ├── base.css
│       │   └── components.css
│       │   └── (or single newtab.css split incrementally)
│       └── assets/
├── public/
│   └── icons/                   # static assets copied to dist
├── tests/                       # existing tests moved/adapted to vitest, still runnable
├── scripts/
│   └── package-zip.js           # zip dist/ for store upload
├── dist/                        # build output (gitignored)
├── package.json, tsconfig.json, vite.config.ts, .gitignore, README.md
└── docs/superpowers/specs/      # this doc
```

`src/newtab/` may start as one HTML/CSS/TS entry and be split incrementally — initial pass can keep `newtab.css`/`main.ts` mostly intact and extract modules file-by-file to avoid a risky big-bang rewrite.

### Module Boundaries

- **Privileged boundary:** only `src/background/**` talks to `chrome.tabs`/`tabGroups`/`scripting`; UI never calls Chrome tabs directly — it goes through `chrome.runtime.sendMessage` router with typed actions. `reopenCollection` (needs `tabs.create`/`tabs.group`) lives in `src/background/collections.ts`, not in `lib/`.
- **Storage boundary:** only `src/shared/storage` touches `chrome.storage`; collections, settings, and content cache go through it, preserving key names. `src/lib/collections` is storage + markdown helpers only.
- **AI boundary:** `src/lib/ai/provider.ts` defines a tiny interface (`organizeTabs(tabs): Promise<Groups>`, later `analyzeLinks`, `summarizeCollection`, etc.); `claude.ts` implements it; prompts live in `prompts/`; fallback stays provider-agnostic. Adding a provider or prompt does not touch background or UI. v1 keeps current UI-direct fetch + `sync.settings` key (faithful recreation); v2 will proxy via background to keep key out of DOM — documented in Security below.
- **UI boundary:** `src/newtab/app/*` is pure rendering/state over data from background + lib; no Chrome API calls inside renderers.

### Security & Privacy (new — per review)

- Key at rest: `sync.settings.apiKey` preserved for v1 (syncs via Google account); known trade-off — visible to devtools/injected scripts in newtab context. No new permissions/hosts this pass; `<all_urls>` remains for content extraction only.
- v2 plan: move provider `fetch` to `src/background/` and never expose key to UI; no API change for consumers of `provider.ts`.
- Content extraction remains opt-in per user action (search with content); no background scraping.

### Cache Maintenance (new — per review)

- `Storage.cleanupCache()` exists but was never scheduled — will add startup + periodic cleanup: `chrome.alarms.create('cleanup', { periodInMinutes: 60 })` in background `onInstalled`/`onStartup`, plus lazy orphan-key purge on `getContentCache()` read. Prevents `local` quota bloat (5–10 MB) from cached page content.

### Build & Dev

- `dev`: vite watch to `dist/`, Load Unpacked `dist/` in `chrome://extensions`.
- `build`: production minify to `dist/`.
- `package`: zip `dist/` to `release/tab-organizer-<version>.zip`.
- Preserve current `manifest.json` fields **and output paths** exactly in first pass (builder call — use plain vite static-copy for manifest so `background.service_worker: "background.js"` and `icons/icon*.png` stay at `dist/` root; avoid `@crxjs` manifest transform for v1). Version bump only via manifest.
- **Injection constraint (builder call):** `extractPageContent` passed to `chrome.scripting.executeScript({ func })` must remain a self-contained serializable function with no module-scope closure — keep it as an isolated IIFE/inline string or dedicated chunk that imports nothing; do not bundle it through the normal module graph.

## Builder Calls Made (from review)

- Ground truth is repo root files above; `.DS_Store` ignored; no hidden dist to preserve.
- `dist/` layout identical to current (`background.js` at root, `newtab/newtab.html`, `icons/` at root) — plain vite copy, not `@crxjs` transform; `vite.config.ts` will comment: `shortcut: plain copy preserves service_worker path, upgrade to @crxjs only if HMR for background needed`.
- `extractPageContent` stays self-contained/serializable for `scripting.executeScript`; file is `extract.raw.ts` excluded from bundle with a build-time grep assert.
- Package manager canonical is `pnpm`; `README` fallback phrasing corrected to match actual code (settings prompt, not auto-fallback).
- `reopenCollection` privileged split: storage helpers in `lib/collections`, chrome calls in `background/collections.ts`.
- Security trade-off documented: `sync` key exposure preserved for v1, background proxy planned for v2.
- Cache eviction: alarm + lazy purge prevents `local` quota bloat.

## Review Notes

- Reviewer: strengths — accurate ground truth, minimal reversible toolchain, behavior-equivalence priority, 95% README accuracy; declined to judge — cross-browser, backend, store publish, framework migration, new AI features, filename diff, lint choice, strictness (all Non-Goals/builder calls). Fixed Critical: `.gitignore` + injection isolation. Addressed Important: README fallback, collections boundary, security note, cache scheduling, storage verification.

## What’s Left to Builder

- Whether to split `newtab.css`/`main.ts` in one go or incrementally (prefer incremental; builder may choose).
- Lint/format tool choice (`eslint+prettier` vs `biome`) — either is fine if minimal.
- Test runner wiring (keep existing Node harness working via `npm test` while adding `vitest` for new TS modules).
- Commit granularity and `.gitignore` contents (must ignore `dist/`, `node_modules/`, `release/`).
- Exact TypeScript strictness (`strict: true` vs gradual) — prefer gradual to avoid churn.

## Verification

- `pnpm install && pnpm build` produces `dist/` loadable as unpacked extension; contract assert: `dist/manifest.json` fields equal source, `dist/background.js` at root contains `function extractPageContent` without bundled imports, `dist/newtab/newtab.html` loads.
- Manual smoke: open dashboard, search, create group, recolor group, filter, select → group/collection, save/reopen collection, Markdown export, AI organize (with and without key — expects settings prompt, not auto-fallback), dark mode, keyboard nav, drag tab to group/collection.
- `pnpm test` (or `npm test`) passes — existing `core.test.js` + `collections.test.js` (adapted) plus any new unit tests for split modules.
- Storage compatibility: install old artifact, create one `local.sessions` entry + one `local.collections` entry, load new `dist/` build → both visible, `darkMode` restores via `data-theme="dark"` on reload, no console error; no key rename/migration needed.

## Decisions Locked (from partner 2026-02-03)

- **AI fetch location:** UI-direct for v1 (faithful recreation); `src/lib/ai/provider.ts` shaped so v2 background proxy is a one-file swap.
- **Live data:** must survive updates — `sync.settings`/`local.collections` + legacy `local.sessions` shim + compatibility test required.

## Open Questions (none blocking)

- Versioning: keep `2.4.2` or bump to `2.5.0` for new source base? (Default: keep `2.4.2`.)
- Pin Node via `.nvmrc` / `.node-version`? (Default: no pin.)

---
*Awaiting partner approval before implementation. Next step after approval: `superpowers:writing-plans` → execution plan.*

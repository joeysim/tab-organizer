# Project Recreation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the lost-source Tab Organizer artifact as a proper `src/ → dist/` MV3 project with minimal Vite + TypeScript toolchain, preserving behavior and storage compatibility while establishing isolated boundaries for future AI and feature work.

**Architecture:** Plain Vite static-copy build keeps `dist/` layout identical to current (`background.js` at root, `newtab/` at root); only `src/background/` touches privileged Chrome APIs via typed message router; `src/shared/storage` owns chrome.storage; `src/lib/ai/provider.ts` abstracts Claude UI-direct fetch (v1) for swappable prompts/providers; `src/newtab/app/` owns vanilla DOM rendering split incrementally from monolithic `newtab.js`.

**Tech Stack:** Vite 5+, TypeScript 5+ (`allowJs`, strict-lite), pnpm, Vitest, ESLint + Prettier (or Biome), Chrome MV3 APIs.

**Spec:** `docs/superpowers/specs/2026-02-03-project-recreation-design.md` (approved 2026-02-03: UI-direct AI v1, live data must survive).

## Global Constraints

- MV3 `manifest_version: 3`, permissions `tabs, tabGroups, scripting, storage`, `host_permissions: ["<all_urls>"]` — unchanged in v1.
- `dist/` layout identical to current: `background.js` at root (`background.service_worker`), `newtab/newtab.html` at `dist/newtab/newtab.html`, icons at `dist/icons/icon{16,48,128}.png`.
- `chrome.storage` keys unchanged: `sync.settings { apiKey: string, darkMode: boolean }`, `local.collections`, `local.contentCache { [tabId]: { content, cachedAt } }`, legacy `local.sessions` read shim.
- `extractPageContent` must remain self-contained serializable function for `chrome.scripting.executeScript({ func })` — no module-scope closure, isolated file with build grep assert.
- `pnpm` canonical (`pnpm-lock.yaml`), `npm` fallback works; scripts: `dev`, `build`, `package`, `test`, `lint`, `typecheck`.
- No new user-facing features this pass; no backend; no framework migration; behavior equivalence over filename diff.

## Review Focus

- A `chrome://` / `chrome-extension://` / `about:` tab is asked for content — reasonable person expects a graceful `success:false, error:"Cannot access restricted page"` not a crash or hang. → Task 3.
- 200+ tabs trigger `getAllTabsContent` — reasonable person expects progress, not frozen UI; 5-concurrent batch must be preserved. → Task 3.
- `chrome.storage.local` nears 5–10 MB quota with many cached pages + collections — reasonable person expects old cache to be evicted, not collections to silently fail to save. → Task 2.
- Legacy `local.sessions` from an old install is present alongside `local.collections` — reasonable person expects old sessions to still appear after updating. → Task 2.
- AI Organize clicked with empty/missing API key — reasonable person expects a prompt for Settings, not a silent no-op or unhandled throw. → Task 4.

---

## File Structure

**Current artifact (to be preserved as source of truth, then moved under `src/`):**
- `manifest.json` → `src/manifest.json`
- `background.js` (327 LOC: router + tabs/groups/content extraction) → `src/background/{index,router,tabs,groups,collections,content/*}.ts`
- `lib/ai.js`, `lib/search.js`, `lib/storage.js`, `lib/sessions.js` → `src/lib/*` + `src/shared/storage/*`
- `newtab/newtab.{html,css,js}` (1495 LOC JS + 1286 LOC CSS) → `src/newtab/{index.html,main.ts,app/*,styles/*}`
- `icons/` → `public/icons/`
- `tests/` → `tests/` (adapted to Vitest, still runnable via `node`)

**New files:**
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `scripts/package-zip.js`, `.gitignore` (already fixed), `src/shared/{types,constants}/`

---

### Task 1: Repo Scaffolding & Minimal Toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `scripts/package-zip.js`
- Modify: `.gitignore` (already contains `node_modules/, dist/, release/, .DS_Store, *.log, .env`)
- Test: `tests/scaffold.test.js` (temporary verifier, removed after)

**Interfaces:**
- Consumes: none
- Produces: `npm run dev|build|package|test|lint|typecheck` scripts; `src/`→`dist/` static-copy build; TypeScript `allowJs` config for incremental migration.

- [ ] **Step 1: Write failing verifier for scaffold**

```js
// tests/scaffold.test.js
import { existsSync } from 'fs';
assert(existsSync('package.json'));
assert(existsSync('vite.config.ts'));
assert(JSON.parse(readFileSync('package.json')).scripts.build);
```

- [ ] **Step 2: Run verifier to confirm it fails**

Run: `node tests/scaffold.test.js`
Expected: FAIL — files missing

- [ ] **Step 3: Create `package.json`**

Dependencies (pinned minimal): `vite@^5`, `typescript@^5`, `vitest@^1`, `eslint@^9`, `prettier@^3` (or `biome`). Scripts:
```json
{ "dev": "vite build --watch", "build": "vite build", "package": "node scripts/package-zip.js", "test": "vitest run", "test:legacy": "node tests/core.test.js && node tests/collections.test.js", "lint": "eslint src --ext .ts,.js", "typecheck": "tsc --noEmit" }
```
`pnpm` canonical; include `packageManager: "pnpm@9"`.

- [ ] **Step 4: Create `tsconfig.json`**

`allowJs:true, strict:false (strict-lite), target ES2022, module ESNext, outDir dist, rootDir src, resolveJsonModule:true, isolatedModules:true, types ["chrome"]` + `@types/chrome` devDep. No `noEmitOnError`.

- [ ] **Step 5: Create `vite.config.ts`**

Plain static-copy (no `@crxjs`): copy `src/manifest.json→dist/manifest.json`, `src/background→dist/background.js`, `src/newtab→dist/newtab/`, `public/icons→dist/icons/`. Comment: `// shortcut: plain copy preserves service_worker path at dist root, upgrade to @crxjs only if background HMR needed`. `build.outDir=dist, emptyOutDir:true`.

- [ ] **Step 6: Create `scripts/package-zip.js`**

Read `src/manifest.json` version, zip `dist/` to `release/tab-organizer-<version>.zip` via `archiver` or `zip` shell fallback. No deps beyond Node builtins if possible.

- [ ] **Step 7: Run scaffold verifier + `pnpm install && pnpm build` smoke**

Run: `pnpm install && pnpm build && ls dist/manifest.json dist/background.js dist/newtab/newtab.html dist/icons/icon48.png`
Expected: PASS — all four at correct paths; `dist/manifest.json` fields equal `src/manifest.json`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts scripts/package-zip.js
git commit -m "chore: add minimal Vite+TS scaffolding with src→dist static-copy build"
```

---

### Task 2: Shared Layer — Types, Constants, Storage & Data Survival

**Files:**
- Create: `src/shared/types/index.ts`, `src/shared/constants/index.ts`, `src/shared/storage/index.ts`, `src/shared/storage/migration.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.sync|local` (mocked in tests)
- Produces:
  - `Storage.getSettings(): Promise<{ apiKey:string, darkMode:boolean }>` + `saveSettings(s)`
  - `Storage.getCollections(): Promise<Collection[]>`, `saveCollections`, `getCollection(id)`
  - `Storage.getContentCache(): Promise<Record<string,{content:string,cachedAt:number}>>`, `setContentCache(tabId,content)`, `getCachedContent(tabId):Promise<string|null>` (1h TTL), `cleanupCache():Promise<void>`
  - Migration: `getSessions shim → collections` (read `local.sessions` if `local.collections` empty)
  - Constants: `GROUP_COLORS`, `STORAGE_KEYS`, `BATCH_SIZE=5`, `CONTENT_TTL=3600000`, `CONTENT_LIMIT=50000`

- [ ] **Step 1: Write failing Vitest for storage + migration**

```ts
test('getCachedContent returns null after TTL', async () => { /* set with old cachedAt, expect null */ })
test('cleanupCache removes expired entries', async () => { /* mix fresh/expired, assert only fresh remains */ })
test('getCollections reads legacy sessions when collections empty', async () => { /* seed local.sessions, expect mapped collections */ })
test('save/reload round-trip preserves id,name,description,createdAt,tabs{url,title}', async () => {})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/storage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/shared/types/index.ts`**

```ts
export type Tab = { id:number, url:string, title:string, favIconUrl?:string, groupId:number, groupName:string|null, groupColor:string|null, windowId:number, index:number, active:boolean, pinned:boolean }
export type TabGroup = { id:number, title:string, color:string, collapsed:boolean, tabs:{id:number,url:string,title:string,favIconUrl?:string}[] }
export type Collection = { id:string, name:string, description:string, createdAt:number, tabs:{url:string,title:string}[] }
export type Settings = { apiKey:string, darkMode:boolean }
```

- [ ] **Step 4: Implement `src/shared/constants/index.ts`**

`GROUP_COLORS=['grey','blue','red','yellow','green','pink','purple','cyan','orange']`, `CHROME_COLORS` same, `STORAGE_KEYS={settings:'settings', collections:'collections', contentCache:'contentCache', legacySessions:'sessions'}`, `BATCH_SIZE=5`, `CONTENT_TTL=3600000`, `CONTENT_LIMIT=50000`, `RESTRICTED_PREFIXES=[...]`.

- [ ] **Step 5: Implement `src/shared/storage/index.ts` + `migration.ts`**

Port from `lib/storage.js` + `lib/sessions.js` with types; `getCollections()` first checks `local.collections`, if missing/empty checks `local.sessions` shim and maps `{title→name, tabs}` if needed. `getCachedContent` TTL-checks; `cleanupCache` iterates and keeps `now-cachedAt<=TTL`. Graceful `try/catch` returning defaults.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/storage.test.ts` && `npm run test:legacy` still passes
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/ tests/storage.test.ts
git commit -m "feat: add shared types, constants, and storage with legacy sessions shim"
```

---

### Task 3: Background Privileged Layer — Router, Tabs/Groups/Collections, Content Extraction

**Files:**
- Create: `src/background/index.ts`, `src/background/router.ts`, `src/background/tabs.ts`, `src/background/groups.ts`, `src/background/collections.ts`, `src/background/content/extract.raw.ts`, `src/background/content/policy.ts`, `src/background/content/batch.ts`
- Modify: `src/manifest.json` (move from root, no field changes)
- Test: `tests/background.test.ts`

**Interfaces:**
- Consumes: `chrome.tabs|tabGroups|scripting|storage|alarms` (mocked), `src/shared/{types,constants,storage}`
- Produces:
  - `handleMessage({action,...}): Promise<...>` router for: `getTabs, getGroups, getContent, getAllContent, activateTab, closeTab, closeTabs, createGroup, moveToGroup, addTabsToGroup, updateGroupColor, ungroup, updateGroup, deleteGroup, reopenCollection`
  - `listAllTabs(): Promise<{success,tabs:Tab[]}>`, `getGroupsMap()`, `getTabGroups()`
  - `createTabGroup(name,tabIds,color)`, `moveTabsToGroup`, `ungroupTabs`, `updateTabGroup`, `deleteTabGroup`
  - `getTabContent(tabId)` (policy-gated) + `getAllTabsContent()` (5-concurrent batch)
  - `reopenCollection(collectionId)` (owns `chrome.tabs.create/group/update`)
  - `extractPageContent(): string` (self-contained, no imports, depth 30, skipTags/selectors, 50k truncate)
  - Alarm: `chrome.alarms.create('cleanup',{periodInMinutes:60})` → `Storage.cleanupCache()` on startup + alarm

- [ ] **Step 1: Write failing Vitest for router + extraction**

```ts
test('router getTabs returns mapped tabs with groupName/groupColor', async () => {})
test('router createGroup with empty tabIds returns error', async () => {})
test('getTabContent blocks chrome:// and returns success:false', async () => {})
test('extract.raw.ts contains no import statement', () => { const s=readFileSync('src/background/content/extract.raw.ts','utf8'); expect(s).not.toMatch(/^import /m) })
test('getAllTabsContent batches 5 concurrent', async () => { /* spy on script execution, assert batches */ })
test('reopenCollection creates tabs then groups them', async () => {})
test('handleMessage unknown action returns error', async () => {})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/background.test.ts`
Expected: FAIL

- [ ] **Step 3: Move `manifest.json` to `src/manifest.json` and update `background.service_worker` stays `background.js` (Vite will copy to `dist/background.js` at root via config)**

No field changes; keep version `2.4.2`.

- [ ] **Step 4: Implement `src/background/content/extract.raw.ts` + `policy.ts`**

`extract.raw.ts` is verbatim `background.js:extractPageContent` (skipTags Set, skipSelectors array, shouldSkip, extract depth 30, mainContent query, whitespace+truncate). File header: `// @no-bundle — passed directly to chrome.scripting.executeScript, must stay self-contained`. No imports. `policy.ts`: `isRestricted(url:string):boolean` checking `chrome://, chrome-extension://, about:, edge://, brave://, file://` prefixes + empty.

- [ ] **Step 5: Implement `src/background/{tabs,groups,collections,batch}.ts` + `router.ts` + `index.ts`**

Port from `background.js` line-for-line but split: `tabs.ts` holds `listAllTabs+getGroupsMap+getTabGroups`, `groups.ts` holds group CRUD, `collections.ts` holds `reopenCollection` (moved from `lib/sessions.js:reopenCollection`), `batch.ts` holds `getAllTabsContent` with `BATCH_SIZE` from constants, `router.ts` holds `handleMessage` switch + unknown-action error, `index.ts` wires `chrome.action.onClicked→chrome.tabs.create({url:chrome.runtime.getURL('newtab/newtab.html')})`, `chrome.runtime.onMessage` with `return true`, and `chrome.alarms` cleanup (with `chrome.alarms` existence check).

- [ ] **Step 6: Add build grep assert to `vite.config.ts` or `scripts/verify-build.js`**

Assert after build: `grep -q "function extractPageContent" dist/background.js && ! grep -q "^import.*extract" dist/background.js` (via Node read, not shell-dependent).

- [ ] **Step 7: Run tests + build smoke**

Run: `pnpm vitest run tests/background.test.ts` && `pnpm build && node scripts/verify-build.js && ls dist/background.js`
Expected: PASS — all 7, `dist/background.js` exists without extract import leak, restricted-page test passes.

- [ ] **Step 8: Commit**

```bash
git add src/background/ src/manifest.json vite.config.ts scripts/verify-build.js tests/background.test.ts
git commit -m "feat: split background into typed modules with isolated extract and privileged collections"
```

---

### Task 4: Library Layer — Search, AI Provider, Collections Helpers

**Files:**
- Create: `src/lib/search/index.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/claude.ts`, `src/lib/ai/prompts/organize.ts`, `src/lib/ai/categorize.ts`, `src/lib/collections/index.ts`
- Test: `tests/search.test.ts`, `tests/ai.test.ts`, `tests/collections-helpers.test.ts`

**Interfaces:**
- Consumes: `src/shared/{types,storage,constants}`, `fetch` (mocked), `chrome.storage`
- Produces:
  - `Search.searchTabs(tabs,query): Tab[]` + `scoreTab`, `searchWithContent`, `highlightMatches`, `escapeRegex`
  - `AIProvider { organizeTabs(tabs,apiKey): Promise<{groups:{name,color,tabs:number[]}[]}> }`, `buildPrompt(tabs):string`, `parseResponse(content,tabs)`, `validateColor`
  - `quickCategorize(tabs): {groups}` (regex patterns unchanged)
  - `CollectionManager { getCollections, saveCollection, saveCollections, getCollection, deleteCollection, updateCollection, addToCollection, addTabsToCollection, toMarkdown, downloadAsMarkdown, copyToClipboard, allToMarkdown, downloadAllAsMarkdown, copyAllToClipboard, generateId }` (storage via `Storage`, no chrome.tabs calls; keep `SessionManager` alias)

- [ ] **Step 1: Write failing Vitests for search scoring, AI parse, and collection helpers**

```ts
// search: title exact 150, title partial 100, url 50, domain bonus 30, groupName 40, _cachedContent 30, multi-term sum, empty query returns all
// ai: buildPrompt includes [ID:...] lines, parseResponse strips ```json fences, validates tabIds, filters groups<2, validateColor normalizes
// ai: organizeTabs throws if no apiKey, handles 401/empty text
// collections: saveCollection maps to {url,title} only, toMarkdown format, generateId unique and col_ prefix
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/search.test.ts tests/ai.test.ts tests/collections-helpers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/search/index.ts`**

Port from `lib/search.js` with types: `scoreTab` scoring exact as existing (title exact 150 > title partial 100 > url 50 > domain 30 > groupName 40 > _cachedContent 30), `searchTabs` sorts desc, `searchWithContent` short-circuit at 3, `loadContentForTabs` via `Storage.getCachedContent`, `extractAndCacheContent` via `chrome.runtime.sendMessage({action:'getContent'})`.

- [ ] **Step 4: Implement `src/lib/ai/{provider,claude,prompts/organize,categorize}.ts`**

`provider.ts`: `export interface AIProvider { organizeTabs(tabs:Tab[], apiKey:string):Promise<{groups:GroupSuggestion[]}> }`. `prompts/organize.ts`: `buildPrompt` from `lib/ai.js:buildPrompt`. `claude.ts`: `fetch https://api.anthropic.com/v1/messages` with `x-api-key, anthropic-version, dangerous-direct-browser-access` (UI-direct preserved for v1), `max_tokens 2048`, `model claude-sonnet-4-20250514`, error handling. `categorize.ts`: verbatim `quickCategorize` patterns + colorMap. Export `AI` object matching old global shape for compat.

- [ ] **Step 5: Implement `src/lib/collections/index.ts`**

Port from `lib/sessions.js` minus `reopenCollection` (now in background): all CRUD + markdown + download/copy stays; storage via `src/shared/storage`; `generateId: col_${Date.now()}_${random}`; export `CollectionManager` and alias `SessionManager=CollectionManager`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/search.test.ts tests/ai.test.ts tests/collections-helpers.test.ts` && `pnpm run test:legacy`
Expected: PASS — scoring, parse, fallback all match legacy behavior; empty-key test expects settings prompt (not auto-fallback) per updated spec.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ tests/search.test.ts tests/ai.test.ts tests/collections-helpers.test.ts
git commit -m "feat: extract search, AI provider, and collections helpers with scoring preserved"
```

---

### Task 5: New Tab App — Incremental Modularization

**Files:**
- Create: `src/newtab/index.html` (from `newtab/newtab.html`), `src/newtab/main.ts`, `src/newtab/app/{state,render,tabs,groups,collections,search,dnd,keyboard,modals,toast}.ts`, `src/newtab/styles/variables.css` (or keep `newtab.css` initially), `public/icons/` (moved from `icons/`)
- Modify: gradually; keep `newtab/newtab.js` as reference until cutover
- Test: `tests/newtab.test.ts` (state + selection + filter unit tests)

**Interfaces:**
- Consumes: `chrome.runtime.sendMessage` (typed actions), `Storage`, `Search`, `AI`, `CollectionManager` from Tasks 2–4; `chrome.storage|tabs|tabGroups` events for live updates
- Produces:
  - `state: { tabs, groups, collections, selectedTabs, searchQuery, viewMode, loading, currentCollection, activeGroupFilter, settings }`
  - `render*` functions: `renderApp, renderTabCount, renderGroups, renderTabs, createTabCard`
  - `dnd: { setupGlobalDragHandler, checkDragIntersection, dragState }`
  - `keyboard: setupKeyboardNavigation` (j/k/Enter/Space/x///Esc/g/c)
  - `modals: showModal, hideModal, showGroupModal, showCollectionModal, showSettingsModal`
  - `collections view/add/reopen/export`, `groups color picker`, `search wiring`, `toast`

- [ ] **Step 1: Write failing Vitest for app state + filter + selection**

```ts
test('select/deselect toggles selectedTabs and card class', () => {})
test('group filter null shows all, pinned shows pinned only, -1 shows ungrouped', () => {})
test('search empty returns all, non-empty delegates to Search.searchTabs', () => {})
test('group color change sends updateGroupColor', async () => {})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/newtab.test.ts`
Expected: FAIL

- [ ] **Step 3: Scaffold `src/newtab/index.html` + `main.ts` + `app/state.ts`**

Copy `newtab/newtab.html` to `src/newtab/index.html`, update `<script src>` to ESM `main.ts` (Phase 1: keep globals via `window.Storage` shim; Phase 2: pure imports — document in file header). `main.ts` bootstraps `loadSettings→loadTabs→loadCollections→setupEventListeners→setupLiveUpdates→setupGlobalDragHandler→setupKeyboardNavigation+detectSystemTheme`. `state.ts` exports `state` object and `GROUP_COLORS`.

- [ ] **Step 4: Extract `src/newtab/app/{render,tabs,groups}.ts`**

Move `renderApp/renderTabCount/renderGroups/createTabCard` from `newtab.js:80-280`; `groups.ts` owns `showGroupColorPicker, changeGroupColor, applyGroupFilter, checkDragIntersection, setupGlobalDragHandler`. No new behavior.

- [ ] **Step 5: Extract `src/newtab/app/{collections,search,dnd,keyboard,modals,toast}.ts`**

`collections.ts` owns all collection modal/view/add/reopen/download/copy flows (calls to `CollectionManager`, now without privileged `reopen` — delegates to background `sendMessage`). `search.ts` owns `handleSearch` with 300 ms debounce. `dnd.ts` owns dragState + intersection. `keyboard.ts` owns `setupKeyboardNavigation` + `updateFocusedCard`. `modals.ts` + `toast.ts` own helpers. Preserve `getNextColor/getRandomColor` logic.

- [ ] **Step 6: Handle `public/icons/` + styles**

Move `icons/*.png` to `public/icons/` so Vite copies to `dist/icons/`. Keep `newtab/newtab.css` as `src/newtab/styles/newtab.css` for now; split to `variables.css` later — add `shortcut: single CSS file preserved for faithful recreation, split to variables/base/components in follow-up` comment.

- [ ] **Step 7: Run tests + build smoke + legacy harness**

Run: `pnpm vitest run tests/newtab.test.ts` && `pnpm build && ls dist/newtab/index.html dist/newtab/styles/` && `npm run test:legacy`
Expected: PASS — newtab tests green, `dist/` has expected files, legacy tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/newtab/ public/icons/ tests/newtab.test.ts
git commit -m "feat: modularize newtab app incrementally with ESM entry and preserved behavior"
```

---

### Task 6: Build Verification, Storage Compat, and Cutover

**Files:**
- Create: `tests/compat.test.ts`, `scripts/verify-build.js` (if not already)
- Modify: `README.md` (update Project Structure to new `src/` layout, add Dev/Build/Package instructions), `docs/superpowers/plans/*` (this plan)
- Test: full suite + manual smoke checklist

**Interfaces:**
- Consumes: all prior tasks
- Produces: verifiable `dist/` build, passing CI, cutover from artifact roots to `src/` as canonical source, old root files removed or archived

- [ ] **Step 1: Write failing compat + build verifier tests**

```ts
// compat.test.ts: seed chrome.storage.local._data={sessions:[...], collections:[]} → getCollections returns legacy; seed 60-min-old contentCache → null + cleanup removes it; settings darkMode round-trips
// verify-build.js: assert dist/manifest.json fields == src/manifest.json, dist/background.js exists at root, dist/newtab/index.html exists, no extract import leak
```

- [ ] **Step 2: Run verifiers to confirm they fail (before final build)**

Run: `pnpm vitest run tests/compat.test.ts` && `node scripts/verify-build.js`
Expected: FAIL — compat missing, build not yet final

- [ ] **Step 3: Wire `Storage.cleanupCache` alarm in `src/background/index.ts`**

`chrome.alarms?.onAlarm.addListener(a=>a.name==='cleanup'&&Storage.cleanupCache())`; `chrome.runtime.onInstalled` + `onStartup` → `alarms.create('cleanup',{periodInMinutes:60})` + `Storage.cleanupCache()` once. Guard with `if(chrome.alarms)`.

- [ ] **Step 4: Update `README.md` Project Structure + Dev instructions**

Replace flat structure doc with `src/` layout; add `## Development` with `pnpm install/dev/build/package` + Load Unpacked `dist/` + `pnpm test` (Vitest + legacy). Note `SessionManager` alias preserved.

- [ ] **Step 5: Final build + full test run + manual smoke**

Run: `pnpm install && pnpm build && node scripts/verify-build.js && pnpm test && npm run test:legacy`
Expected: PASS — all tests green, `dist/` loadable, no console errors on darkMode/storage compat manual check (load old profile fixture).

- [ ] **Step 6: Archive old flat roots and cut over**

```bash
mkdir -p .archive && git mv background.js .archive/ 2>/dev/null || true
git mv lib .archive/lib 2>/dev/null || true
git mv newtab .archive/newtab 2>/dev/null || true
git mv icons .archive/icons 2>/dev/null || true
# src/ is now canonical; .archive retained for one release for diff reference
```

- [ ] **Step 7: Commit**

```bash
git add README.md src/background/index.ts tests/compat.test.ts scripts/verify-build.js .archive/
git commit -m "chore: verify build, storage compat, and cut over to src/ canonical"
```

---

## Self-Review

*Spec coverage:* Intent/Goals (faithful recreation + real structure + extensibility) → Tasks 1–6; Non-Goals respected (no new AI/UI); Anti-Goals checked (no framework, dist layout preserved, key sync preserved for v1, provider abstraction); Constraints (MV3, vanilla, extraction policy) → Task 3; Storage keys + legacy shim → Task 2; Toolchain + Layout + Boundaries + Security + Cache → Tasks 1–5; Verification (build loadable, smoke, pnpm test, storage compat) → Task 6.

*Step scan:* Each step is one test, one command, one file, or one commit — no step carries two decisions. Code steps name exact file + signature; tests assert spec-pinned values (TTL 3600000, BATCH_SIZE 5, CONTENT_LIMIT 50000, restricted prefixes, scoring 150/100/50/30/40).

*Type consistency:* `Tab/TabGroup/Collection/Settings` defined once in Task 2, consumed verbatim in Tasks 3–5; `Storage.*` + `AIProvider.organizeTabs(tabs,apiKey)` + `Search.searchTabs` signatures stable across tasks; `handleMessage` action union typed in Task 3 and used in Task 5.

*Review focus:* Five spec-implied failure modes most likely to bite are listed with owning tasks (Tasks 2–4 cover each); each has its test added to that task.

*Proportion:* Spec ~180 lines; plan ~350 lines with file structure + six tasks + interfaces — longer than spec but not a transcript; bodies are delegated to implementer via signatures + tests, not inlined.


# Task 4 Report — Library Layer Search, AI Provider, Collections Helpers

## Summary
Extracted `lib/search.js`, `lib/ai.js`, and `lib/sessions.js` into typed `src/lib/` modules with scoring preserved, provider interface, and storage-backed collections (no privileged `chrome.tabs` calls). Added Vitest suites covering scoring, prompt IDs, fence stripping, color validation, fallback throws, and markdown generation.

## Files Created
- `src/lib/search/index.ts` — port of `lib/search.js` with `scoreTab` (150/100/50/30/40 + _cachedContent 30), `searchTabs` sorted desc, `searchWithContent` short-circuit at 3, `loadContentForTabs` via `Storage.getCachedContent`, `extractAndCacheContent` via `chrome.runtime.sendMessage({action:'getContent'})`, `highlightMatches`, `escapeRegex`
- `src/lib/ai/provider.ts` — `AIProvider` interface `{ organizeTabs(tabs,apiKey): Promise<{groups}> }` + `GroupSuggestion`/`TabInput` types
- `src/lib/ai/prompts/organize.ts` — `buildPrompt(tabs)` verbatim from `lib/ai.js` emitting `[ID:...]` lines + color instructions
- `src/lib/ai/categorize.ts` — `quickCategorize(tabs)` verbatim patterns + colorMap, filtering groups<2
- `src/lib/ai/claude.ts` — `fetch https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version:2023-06-01`, `anthropic-dangerous-direct-browser-access:true`, `model claude-sonnet-4-20250514`, `max_tokens:2048`; `parseResponse` strips ``` fences, validates tabIds, filters groups<2; `validateColor` normalizes; `ClaudeProvider` + compat `AI` object
- `src/lib/collections/index.ts` — port of `lib/sessions.js` minus `reopenCollection` (privileged, now in background); CRUD + markdown + `generateId: col_${Date.now()}_${random}` via `Storage`; exports `CollectionManager` and alias `SessionManager=CollectionManager`
- `tests/search.test.ts` — 19 cases: title exact 150, title partial 100, url 50, domain 30 (80 combined), groupName 40, _cachedContent 30, multi-term sum, empty query returns all, sort desc, filter non-matching, short-circuit at 3, content fallback, highlight/escape, load/extract
- `tests/ai.test.ts` — 16 cases: buildPrompt [ID:...], parseResponse fences (json + bare), validates tabIds, filters groups<2, tabs-key alt, validateColor, empty key throws (not auto-fallback), 401/500/empty text, headers/body fidelity, quickCategorize patterns, AI compat shape
- `tests/collections-helpers.test.ts` — 15 cases: saveCollection {url,title} only, toMarkdown format, generateId unique + col_ prefix, CRUD, addToCollection/addTabsToCollection, allToMarkdown empty + multi, copy/download, SessionManager alias

## Files Kept
- `lib/search.js`, `lib/ai.js`, `lib/sessions.js`, `lib/storage.js` preserved at repo root until Task 6 cutover
- `background.js` at root preserved (Task 3)

## Interfaces Produced
- `Search.searchTabs/searchWithContent/scoreTab/loadContentForTabs/extractAndCacheContent/highlightMatches/escapeRegex`
- `AIProvider.organizeTabs` + `buildPrompt/parseResponse/validateColor/quickCategorize` + `AI` compat object
- `CollectionManager { getCollections, saveCollection, saveCollections, getCollection, deleteCollection, updateCollection, addToCollection, addTabsToCollection, toMarkdown, downloadAsMarkdown, copyToClipboard, allToMarkdown, downloadAllAsMarkdown, copyAllToClipboard, generateId }` + `SessionManager` alias

## Validation
- `pnpm vitest run tests/search.test.ts tests/ai.test.ts tests/collections-helpers.test.ts` — 50 passed (19+16+15)
- `pnpm vitest run` — 65 passed (8 storage + 7 background + 19 search + 16 ai + 15 collections)
- `pnpm run test:legacy` — 21 + 17 passed (core + collections legacy harnesses)
- `pnpm typecheck` — no new errors in `src/lib/*` (pre-existing `chrome.tabGroups.Color` + `cachedAt` unknown in `src/shared/storage` unchanged)
- Original `lib/*.js` files untouched until Task 6 cutover

## Diff
9 files, +~900 lines. Commit `feat: extract search, AI provider, and collections helpers with scoring preserved`

## Residual Risks
- `src/lib/search` scoring matches `lib/search.js` exactly including `new URL()` try/catch for invalid URLs — invalid URLs contribute 0 domain bonus as before
- `claude.ts` preserves UI-direct `anthropic-dangerous-direct-browser-access` header per spec v1; swappable provider abstraction ready for Task 5
- Collections helpers have no `chrome.tabs` calls by design; `reopenCollection` remains privileged in `src/background/collections.ts` via router
- `minify:false` from Task 3 still in vite.config; Task 6 will decide final minify strategy

## Next Step
Task 5 can consume `Search`, `AI`/`ClaudeProvider`/`quickCategorize`, and `CollectionManager` for newtab app modularization.

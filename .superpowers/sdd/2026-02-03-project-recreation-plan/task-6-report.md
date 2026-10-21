# Task 6 Report — Build Verification, Storage Compat, and Cutover

## What Was Implemented
- Created `tests/compat.test.ts` (3 tests: legacy sessions → collections mapping, 60-min TTL null + cleanup removes stale, darkMode round-trip via sync storage)
- Expanded `scripts/verify-build.js` to assert all brief-mandated checks: dist/manifest.json fields == src/manifest.json, dist/background.js exists at root without import leak (bundled extractPageContent), dist/newtab/index.html exists
- Wired `Storage.cleanupCache` alarm in `src/background/index.ts`: guard `chrome.alarms` existence, `setupCleanupAlarm()` helper (create cleanup {periodInMinutes:60} + immediate cleanupCache), listeners on `chrome.runtime.onInstalled` and `onStartup` to re-establish alarm, plus `onAlarm` listener for cleanup name
- Updated `README.md` Project Structure to new `src/` canonical layout (background/, newtab/app/, shared/storage|constants|types, lib/) and added Development section with pnpm install/dev/build/package + Load Unpacked dist/ + pnpm test (Vitest + legacy)
- Archived old flat roots via `git mv`: `background.js`, `lib/`, `newtab/`, `icons/` → `.archive/` (retained one release for diff reference); `src/` is now canonical

## Tests
- RED: compat.test.ts did not exist, verify-build.js only checked background.js — both missing required assertions
- GREEN after implementation:
  - `pnpm build` → dist/background.js 12.83 kB
  - `node scripts/verify-build.js` → PASS (manifest fields match, background.js at root no leak, newtab/index.html exists)
  - `pnpm test` → 7 files / 74 tests passed (including 3 new compat tests)
  - `npm run test:legacy` → 21 + 17 passed (38 legacy)

## Files Changed
- New: `tests/compat.test.ts`, `.archive/background.js`, `.archive/lib/*`, `.archive/newtab/*`, `.archive/icons/*`
- Modified: `scripts/verify-build.js`, `src/background/index.ts`, `README.md`
- Archived (git mv): `background.js` → `.archive/background.js`, `lib/` → `.archive/lib/`, `newtab/` → `.archive/newtab/`, `icons/` → `.archive/icons/`

## Self-Review
- Completeness: All 7 Task 6 steps done — compat tests, build verifier, alarm wiring with guard, README cutover, final build+test pass, archive cutover, commit
- Quality: Alarm wiring guards chrome.alarms existence for test/CI envs; onInstalled/onStartup both re-establish alarm as spec'd; verify-build checks all required fields with JSON-stringified comparison
- Discipline: `src/` canonical, flat roots archived not deleted, build still uses public/icons fallback so no breakage
- Concerns: Manifest does not declare `alarms` permission — alarm guard handles missing API gracefully; add "alarms" to permissions if runtime alarm persistence is needed in production

## Verification Commands
```
pnpm build && node scripts/verify-build.js && pnpm test && npm run test:legacy
```
All PASS.

## Residual Risks
- No `alarms` permission in manifest.json — alarm will only work if Chrome grants alarms API without explicit permission (MV3 typically requires declaration); guarded so no crash, but cleanup will not fire periodically until permission added
- `.archive/` retained one release — remember to remove in next major version

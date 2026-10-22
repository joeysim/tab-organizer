# Project Patterns — Tab Organizer

## Bugfix TDD (enforced)
No production code without a failing test first. Write test → watch it fail for expected reason → minimal fix → verify all green. See `tests/settings-theme.test.ts` for canonical example.

## Vite Newtab Bundling
Vite must bundle `src/newtab/index.html` as HTML entry (not copy `main.ts` as-is). `vite.config.ts` uses `rollupOptions.input { background, newtab }` and post-processes `dist/src/newtab/index.html → dist/newtab/index.html` + `dist/assets/background-*.js → dist/background.js` to satisfy `manifest.service_worker` at `dist` root. Test: `tests/settings-theme.test.ts` asserts `dist/newtab/index.html` exists, contains `.js` not `main.ts`, and `dist/background.js` contains `extractPageContent`.

## Theme Preference
Initial `state.hasExplicitThemePreference = false`; only `true` after user Saves Settings or `loadSettings` finds stored `darkMode`. `detectSystemTheme()` checks this flag, not `darkMode !== undefined` (which is always defined). Tests: `settings-theme.test.ts` — OS dark applied only when flag false, ignored when true.

## Settings Modal
`main.ts` wires `settingsBtn → showSettingsModal()`; `modals.ts` populates inputs from `state`, saves via `Storage.saveSettings`, sets `hasExplicitThemePreference = true`, and toggles `data-theme`. Test: `settings-theme.test.ts` verifies populate, save, and persistence.


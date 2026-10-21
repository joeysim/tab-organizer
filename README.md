# Tab Organizer Dashboard

AI-powered Chrome extension that helps you tame tab sprawl — search, group, save, and restore tabs from a single dashboard.

## Features

- **Dashboard** — grid/list view of all open tabs with favicons, live tab-count, and real-time updates when tabs are created, moved, or closed.
- **Search** — full-text search scored by title, URL, domain, group name, and cached page content.
- **Tab Groups** — create colour-coded Chrome tab groups, re-colour them, filter the grid by group or pinned tabs, and drag tabs between groups/collections.
- **Collections** — save any selection of tabs as a named collection (URL + title only), reopen or export them later. Add links manually, export to Markdown, or copy to clipboard.
- **AI Organize** — describe your tabs to Claude (Sonnet 4) and apply suggested groupings in one click; falls back to regex-based `quickCategorize` without an API key.
- **Dark mode & keyboard shortcuts** — `j`/`k` navigation, `/` to search, `Space` to select, `Enter` to open, `g`/`c` for quick group/collection.

## Project Structure

```
tab-organizer/
├── manifest.json       # MV3 manifest (service_worker + action)
├── background.js       # Service worker — tab/group CRUD, content extraction, message router
├── lib/
│   ├── ai.js           # Claude API integration + quickCategorize fallback
│   ├── search.js       # Scored tab search & cached-content search
│   ├── sessions.js     # CollectionManager (save/reopen/export collections)
│   └── storage.js      # chrome.storage wrapper (settings, sessions, content cache)
├── newtab/
│   ├── newtab.html     # Dashboard markup (toolbar, sidebar, modals)
│   ├── newtab.css      # Theming via CSS variables, dark mode, group colours
│   └── newtab.js       # App state, rendering, drag & drop, modals, keyboard nav
├── icons/              # Extension icons (16/48/128 px)
└── tests/
    ├── test-utils.js
    ├── core.test.js
    └── collections.test.js
```

## Install (development)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Click the extension icon to open the dashboard, or navigate to the new-tab page it registers.

No build step or dependencies — pure vanilla JS + Chrome Extension APIs.

## Usage

| Action | How |
|---|---|
| Search tabs | Type in the header search bar |
| Filter by group | Click a group in the sidebar |
| Select tabs | Checkbox or `Space` on focused card |
| Create group | Select tabs → **Group** (or sidebar **+ New Group**) |
| Save collection | Select tabs → **Save Collection** |
| Add to collection | Select tabs → **Add to Collection**, or drag tabs onto a collection |
| Reopen collection | Click it → **Reopen All Tabs** |
| Export | **Copy to Clipboard** / **Download Markdown** per-collection or for all |
| AI organize | Set Claude API key in **Settings** (⚙) → **AI Organize** → preview → **Apply** |

### Settings

- **Claude API key** — required for AI organization; stored in `chrome.storage.sync`. Without it the AI button prompts for settings and `quickCategorize` can be used programmatically.
- **Dark mode** — toggles `data-theme="dark"` on the document root.

### Content Extraction

`background.js` injects `extractPageContent()` via `chrome.scripting.executeScript`, skipping nav/chrome/ads/hidden elements, and truncates to ~50 KB. Results are batched (5 concurrent) and cached for 1 hour via `Storage`. Restricted URLs (`chrome://`, `chrome-extension://`, `about:`, `edge://`, `brave://`, `file://`) are skipped.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | List, activate, close, group/ungroup tabs |
| `tabGroups` | Create/update/query tab groups |
| `scripting` | Inject content extractor |
| `storage` | Persist settings, collections, content cache |
| `<all_urls>` | Extract page content from any tab |

## Storage

- `chrome.storage.sync` — `settings` (`apiKey`, `darkMode`).
- `chrome.storage.local` — `collections` (array of `{ id, name, description, createdAt, tabs }`), `contentCache` (per-tab `{ content, cachedAt }` with 1 h TTL), legacy `sessions` key.

## Testing

```bash
node tests/core.test.js
node tests/collections.test.js
```

Tests use a `mockChrome` harness in `tests/test-utils.js` — no browser required.

## Architecture Notes

- `background.js` is the sole privileged layer; `newtab.js` talks to it exclusively via `chrome.runtime.sendMessage`.
- `CollectionManager` is aliased as `SessionManager` for backwards compatibility.
- Drag-and-drop uses an intersection-based detector (`checkDragIntersection`) so the drop target is the element with the greatest overlap under the dragged card.
- Live tab/group updates are debounced (100 ms) via `chrome.tabs` / `chrome.tabGroups` event listeners.

## License

No license file is included. Add one if you plan to distribute.

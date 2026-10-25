/**
 * @vitest-environment jsdom
 * App-window tabs (installed PWAs) are hidden unless the user opts in.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

function seedDom() {
  document.body.innerHTML = `
    <span id="tabCount"></span>
    <div id="groupList"></div>
    <div id="tabGrid"></div>
    <div id="emptyState" style="display:none"></div>
    <div id="loading"></div>
    <div id="selectionInfo"></div>
    <span id="selectedCount"></span>
  `;
}

const NORMAL = {
  id: 1, title: 'Inbox', url: 'https://mail.google.com/mail/u/0', favIconUrl: '',
  groupId: -1, groupName: null, groupColor: null, windowId: 10, windowType: 'normal',
  index: 0, active: true, pinned: false,
};
const APP = {
  id: 2, title: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox', favIconUrl: '',
  groupId: -1, groupName: null, groupColor: null, windowId: 99, windowType: 'app',
  index: 0, active: true, pinned: false,
};
const POPUP = {
  id: 3, title: 'Docs', url: 'https://docs.example.com', favIconUrl: '',
  groupId: -1, groupName: null, groupColor: null, windowId: 11, windowType: 'popup',
  index: 0, active: true, pinned: false,
};

function installChrome(tabs: unknown[]) {
  const mock = {
    runtime: {
      sendMessage: vi.fn(async (msg: { action: string }) => {
        if (msg.action === 'getTabs') return { success: true, tabs };
        if (msg.action === 'getGroups') return { success: true, groups: [] };
        return { success: true };
      }),
    },
  };
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
  return mock;
}

async function load(showAppWindows: boolean) {
  seedDom();
  installChrome([NORMAL, APP, POPUP]);
  vi.resetModules();
  const { state } = await import('../src/newtab/app/state.js');
  state.settings = { apiKey: '', darkMode: false, showAppWindows };
  const { loadTabs } = await import('../src/newtab/app/render.js');
  await loadTabs(false);
  return state;
}

describe('app window visibility', () => {
  beforeEach(() => vi.useRealTimers());

  test('app-window tabs are hidden by default', async () => {
    const state = await load(false);
    expect(state.tabs.map((t) => t.id)).toEqual([1, 3]); // app excluded, popup kept
  });

  test('app-window tabs appear when opted in', async () => {
    const state = await load(true);
    expect(state.tabs.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  test('popup windows are not treated as apps', async () => {
    const state = await load(false);
    expect(state.tabs.some((t) => t.id === 3)).toBe(true);
  });

  test('tabs with no windowType are treated as normal', async () => {
    seedDom();
    installChrome([{ ...NORMAL, windowType: undefined }]);
    vi.resetModules();
    const { state } = await import('../src/newtab/app/state.js');
    state.settings = { apiKey: '', darkMode: false };
    const { loadTabs } = await import('../src/newtab/app/render.js');
    await loadTabs(false);
    expect(state.tabs).toHaveLength(1);
  });

  test('tab count reflects the filtered list', async () => {
    await load(false);
    expect(document.getElementById('tabCount')!.textContent).toBe('2 tabs');
  });
});

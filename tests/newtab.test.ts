/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

// helpers to install chrome mock
function installChrome(overrides: Record<string, unknown> = {}) {
  const chromeMock: Record<string, unknown> = {
    runtime: { sendMessage: vi.fn(async () => ({ success: true })), getURL: vi.fn((p: string) => `chrome-extension://abc/${p}`) },
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
    tabs: { onCreated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    tabGroups: { onCreated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() } },
    ...overrides,
  };
  (globalThis as unknown as Record<string, unknown>).chrome = chromeMock as unknown as typeof chrome;
  return chromeMock;
}

describe('newtab state + selection', () => {
  beforeEach(() => {
    installChrome();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  test('select/deselect toggles selectedTabs and card class', async () => {
    const { state } = await import('../src/newtab/app/state.js');
    const { toggleTabSelection } = await import('../src/newtab/app/tabs.js');

    // reset
    state.selectedTabs.clear();
    // create a fake card in DOM
    const card = document.createElement('div');
    card.dataset.tabId = '42';
    card.className = 'tab-card';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tab-checkbox';
    card.appendChild(cb);
    document.body.appendChild(card);

    expect(state.selectedTabs.has(42)).toBe(false);
    toggleTabSelection(42);
    expect(state.selectedTabs.has(42)).toBe(true);
    expect(card.classList.contains('selected')).toBe(true);
    expect(cb.checked).toBe(true);

    toggleTabSelection(42);
    expect(state.selectedTabs.has(42)).toBe(false);
    expect(card.classList.contains('selected')).toBe(false);
    expect(cb.checked).toBe(false);
  });

  test('group filter null shows all, pinned shows pinned only, -1 shows ungrouped', async () => {
    const { state } = await import('../src/newtab/app/state.js');
    const { getVisibleTabIds } = await import('../src/newtab/app/groups.js');

    state.tabs = [
      { id: 1, url: 'https://a.com', title: 'A', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 0, active: false, pinned: false },
      { id: 2, url: 'https://b.com', title: 'B', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 1, active: false, pinned: true },
      { id: 3, url: 'https://c.com', title: 'C', groupId: 10, groupName: 'Work', groupColor: 'blue', windowId: 1, index: 2, active: false, pinned: false },
    ] as unknown as typeof state.tabs;
    state.groups = [
      { id: 10, title: 'Work', color: 'blue', collapsed: false, tabs: [{ id: 3, url: 'https://c.com', title: 'C' }] },
      { id: -1, title: '', color: 'grey', collapsed: false, tabs: [{ id: 1, url: 'https://a.com', title: 'A' }, { id: 2, url: 'https://b.com', title: 'B' }] },
    ] as unknown as typeof state.groups;

    // null => all (represented as null meaning no filter)
    expect(getVisibleTabIds(null)).toBeNull();

    // pinned => only pinned ids
    const pinned = getVisibleTabIds('pinned' as unknown as number);
    expect(pinned).toBeInstanceOf(Set);
    expect([...(pinned as Set<number>)]).toEqual([2]);

    // -1 => ungrouped
    const ungrouped = getVisibleTabIds(-1);
    expect([...(ungrouped as Set<number>)]).toEqual(expect.arrayContaining([1, 2]));
    // but implementation for -1 returns group -1 tabs
    expect((ungrouped as Set<number>).has(1)).toBe(true);
  });

  test('search empty returns all, non-empty delegates to Search.searchTabs', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const spy = vi.spyOn(Search, 'searchTabs');
    const { filterTabsBySearch } = await import('../src/newtab/app/search.js');

    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'Google', url: 'https://google.com' },
    ] as unknown as Parameters<typeof filterTabsBySearch>[0];

    // empty => returns all without calling search
    spy.mockClear();
    const all = filterTabsBySearch(tabs, '');
    expect(all).toEqual(tabs);
    expect(spy).not.toHaveBeenCalled();

    // non-empty delegates
    spy.mockClear();
    const filtered = filterTabsBySearch(tabs, 'github');
    expect(spy).toHaveBeenCalledWith(tabs, 'github');
    expect(filtered.length).toBe(1);
  });

  test('group color change sends updateGroupColor', async () => {
    const chromeMock = installChrome();
    vi.resetModules();
    const { changeGroupColor } = await import('../src/newtab/app/groups.js');

    await changeGroupColor(123, 'red');
    expect((chromeMock.runtime as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith({
      action: 'updateGroupColor',
      groupId: 123,
      color: 'red',
    });
  });

  test('color helpers round-robin and random', async () => {
    const { getNextColor, getRandomColor, GROUP_COLORS, resetColorIndex } = await import('../src/newtab/app/state.js');
    resetColorIndex();
    const first = getNextColor();
    const second = getNextColor();
    expect(GROUP_COLORS).toContain(first);
    expect(GROUP_COLORS).toContain(second);
    expect(first).not.toBe(second);
    // cycle through all and wrap
    resetColorIndex();
    for (let i = 0; i < GROUP_COLORS.length; i++) getNextColor();
    expect(getNextColor()).toBe(GROUP_COLORS[0]);
    const rand = getRandomColor();
    expect(GROUP_COLORS).toContain(rand);
  });

  test('debounced search handler waits 300ms', async () => {
    vi.useFakeTimers();
    const { createSearchHandler } = await import('../src/newtab/app/search.js');
    const cb = vi.fn();
    const handler = createSearchHandler(cb, 300);
    handler('a');
    handler('ab');
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('ab');
    vi.useRealTimers();
  });
});

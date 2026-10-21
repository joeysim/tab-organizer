import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';

function createChromeMock(opts: {
  tabs?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
  tabGetMap?: Record<number, Record<string, unknown>>;
  collections?: Array<Record<string, unknown>>;
} = {}) {
  const tabsData = opts.tabs ?? [];
  const groupsData = opts.groups ?? [];
  const tabGetMap: Record<number, Record<string, unknown>> = opts.tabGetMap ?? {};
  const collectionsData = opts.collections ?? [];

  const executeScriptMock = vi.fn(async ({ target }: { target: { tabId: number } }) => {
    // default return
    return [{ result: `content for ${target.tabId}` }];
  });

  const mock: Record<string, unknown> = {
    tabs: {
      query: vi.fn(async (queryInfo?: Record<string, unknown>) => {
        if (queryInfo && typeof queryInfo.groupId === 'number') {
          return tabsData.filter((t) => t.groupId === queryInfo.groupId);
        }
        return tabsData;
      }),
      get: vi.fn(async (tabId: number) => {
        if (tabGetMap[tabId]) return tabGetMap[tabId];
        return { id: tabId, url: `https://example.com/${tabId}`, title: `Tab ${tabId}`, windowId: 1 };
      }),
      create: vi.fn(async ({ url }: { url: string }) => {
        // generate deterministic id based on url
        const id = Math.floor(Math.random() * 100000) + 1000;
        return { id, url };
      }),
      group: vi.fn(async ({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
        if (groupId !== undefined) return groupId;
        return 999;
      }),
      ungroup: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    tabGroups: {
      query: vi.fn(async () => groupsData),
      update: vi.fn(async () => {}),
    },
    scripting: {
      executeScript: executeScriptMock,
    },
    windows: {
      update: vi.fn(async () => {}),
    },
    storage: {
      local: {
        get: vi.fn(async (keys?: unknown) => {
          // handle collections request
          if (Array.isArray(keys) && (keys as string[]).includes('collections')) {
            return { collections: collectionsData };
          }
          if (typeof keys === 'string' && keys === 'collections') {
            return { collections: collectionsData };
          }
          // generic empty
          return {};
        }),
        set: vi.fn(async () => {}),
      },
      sync: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`),
    },
    action: {
      onClicked: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
  };

  return { mock, executeScriptMock };
}

function installChrome(mock: Record<string, unknown>) {
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
}

describe('background router + extraction', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('router getTabs returns mapped tabs with groupName/groupColor', async () => {
    const tabs = [
      { id: 1, url: 'https://a.com', title: 'A', favIconUrl: 'https://a.com/fav.ico', groupId: 10, windowId: 1, index: 0, active: true, pinned: false },
      { id: 2, url: 'https://b.com', title: 'B', favIconUrl: undefined, groupId: -1, windowId: 1, index: 1, active: false, pinned: false },
    ];
    const groups = [
      { id: 10, title: 'Work', color: 'blue', collapsed: false },
    ];
    const { mock } = createChromeMock({ tabs, groups });
    installChrome(mock);
    vi.resetModules();
    const { handleMessage } = await import('../src/background/router.js');

    const result = await handleMessage({ action: 'getTabs' } as unknown as Record<string, unknown>);
    expect(result.success).toBe(true);
    expect((result as { tabs: Array<Record<string, unknown>> }).tabs).toHaveLength(2);
    const mapped = (result as { tabs: Array<Record<string, unknown>> }).tabs;
    expect(mapped[0].groupName).toBe('Work');
    expect(mapped[0].groupColor).toBe('blue');
    expect(mapped[1].groupName).toBeNull();
    expect(mapped[1].groupColor).toBeNull();
  });

  test('router createGroup with empty tabIds returns error', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { handleMessage } = await import('../src/background/router.js');

    const result = await handleMessage({ action: 'createGroup', name: 'Test', tabIds: [], color: 'blue' } as unknown as Record<string, unknown>);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/No tabs provided/);
  });

  test('getTabContent blocks chrome:// and returns success:false', async () => {
    const tabGetMap = {
      42: { id: 42, url: 'chrome://extensions', title: 'Extensions', windowId: 1 },
    };
    const { mock, executeScriptMock } = createChromeMock({ tabGetMap });
    installChrome(mock);
    vi.resetModules();
    const { getTabContent } = await import('../src/background/content/batch.js');

    const result = await getTabContent(42);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/restricted/i);
    expect(executeScriptMock).not.toHaveBeenCalled();
  });

  test('extract.raw.ts contains no import statement', () => {
    const s = readFileSync('src/background/content/extract.raw.ts', 'utf8');
    expect(s).not.toMatch(/^import /m);
    // also ensure contains extractPageContent
    expect(s).toMatch(/function extractPageContent/);
    expect(s).toMatch(/skipTags/);
    expect(s).toMatch(/depth > 30/);
    expect(s).toMatch(/50000/);
  });

  test('getAllTabsContent batches 5 concurrent', async () => {
    // create 12 tabs
    const tabs = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      url: `https://example.com/${i + 1}`,
      title: `Tab ${i + 1}`,
      windowId: 1,
      index: i,
      active: false,
      pinned: false,
      favIconUrl: undefined,
      groupId: -1,
    }));
    const tabGetMap: Record<number, Record<string, unknown>> = {};
    for (const t of tabs) {
      tabGetMap[t.id as number] = { id: t.id, url: t.url, title: t.title, windowId: 1 };
    }

    let concurrent = 0;
    let maxConcurrent = 0;
    const calls: number[] = [];

    const { mock } = createChromeMock({ tabs, tabGetMap });
    // override executeScript to track concurrency with delay
    const scriptingMock = mock.scripting as { executeScript: ReturnType<typeof vi.fn> };
    scriptingMock.executeScript = vi.fn(async ({ target }: { target: { tabId: number } }) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      calls.push(target.tabId);
      // small delay to allow concurrency overlap
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return [{ result: `content ${target.tabId}` }];
    });

    installChrome(mock);
    vi.resetModules();
    const { getAllTabsContent } = await import('../src/background/content/batch.js');

    const result = await getAllTabsContent();
    expect(result.success).toBe(true);
    expect((result as { tabs: unknown[] }).tabs).toHaveLength(12);
    expect(calls).toHaveLength(12);
    // batches of 5: max concurrent should be 5 (first two batches), third batch 2
    expect(maxConcurrent).toBe(5);
    // also verify batching via BATCH_SIZE constant
    const { BATCH_SIZE } = await import('../src/shared/constants/index.js');
    expect(BATCH_SIZE).toBe(5);
  });

  test('reopenCollection creates tabs then groups them', async () => {
    const collections = [
      {
        id: 'col_1',
        name: 'My Col',
        description: '',
        createdAt: Date.now(),
        tabs: [
          { url: 'https://a.com', title: 'A' },
          { url: 'https://b.com', title: 'B' },
          { url: 'https://c.com', title: 'C' },
        ],
      },
    ];
    const { mock } = createChromeMock({ collections });
    installChrome(mock);
    vi.resetModules();
    const { handleMessage } = await import('../src/background/router.js');

    const result = await handleMessage({ action: 'reopenCollection', collectionId: 'col_1' } as unknown as Record<string, unknown>);
    expect(result.success).toBe(true);
    expect((result as { tabsOpened: number }).tabsOpened).toBe(3);
    expect((mock.tabs as unknown as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledTimes(3);
    expect((mock.tabs as unknown as { group: ReturnType<typeof vi.fn> }).group).toHaveBeenCalledTimes(1);
    expect((mock.tabGroups as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledTimes(1);
    const groupCall = (mock.tabs as unknown as { group: ReturnType<typeof vi.fn> }).group.mock.calls[0][0] as { tabIds: number[] };
    expect(groupCall.tabIds).toHaveLength(3);
    const updateCall = (mock.tabGroups as unknown as { update: ReturnType<typeof vi.fn> }).update.mock.calls[0];
    expect(updateCall[1].title).toBe('My Col');
  });

  test('handleMessage unknown action returns error', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { handleMessage } = await import('../src/background/router.js');

    const result = await handleMessage({ action: 'bogusAction' } as unknown as Record<string, unknown>);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/Unknown action: bogusAction/);
  });
});

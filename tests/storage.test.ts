import { describe, test, expect, beforeEach, vi } from 'vitest';

function createMockChrome(
  initialLocal: Record<string, unknown> = {},
  initialSync: Record<string, unknown> = {},
) {
  const localData: Record<string, unknown> = { ...initialLocal };
  const syncData: Record<string, unknown> = { ...initialSync };

  function handleGet(store: Record<string, unknown>, keys: unknown): Record<string, unknown> {
    // chrome.storage.get supports: string | string[] | object | null/undefined
    if (keys === null || keys === undefined || (Array.isArray(keys) && keys.length === 0)) return { ...store };
    if (typeof keys === 'string') return { [keys]: store[keys] };
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const k of keys as string[]) out[k] = store[k];
      return out;
    }
    // object form { key: default }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(keys as Record<string, unknown>)) {
      out[k] = store[k] ?? (keys as Record<string, unknown>)[k];
    }
    return out;
  }

  const mock = {
    storage: {
      local: {
        _data: localData,
        get: vi.fn(async (keys?: unknown) => handleGet(localData, keys)),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(localData, data);
        }),
      },
      sync: {
        _data: syncData,
        get: vi.fn(async (keys?: unknown) => handleGet(syncData, keys)),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(syncData, data);
        }),
      },
    },
  };
  return { mock, localData, syncData };
}

function installChrome(mock: ReturnType<typeof createMockChrome>['mock']) {
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
}

describe('storage', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('getCachedContent returns null after TTL', async () => {
    const { mock } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const tabId = '42';
    const expiredAt = Date.now() - 2 * 60 * 60 * 1000; // 2h ago (TTL 1h)
    (mock.storage.local._data as Record<string, unknown>).contentCache = {
      [tabId]: { content: 'stale hello', cachedAt: expiredAt },
    };

    const result = await Storage.getCachedContent(tabId);
    expect(result).toBeNull();
  });

  test('getCachedContent returns content within TTL', async () => {
    const { mock } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const tabId = '7';
    const freshAt = Date.now() - 10 * 60 * 1000; // 10min ago
    (mock.storage.local._data as Record<string, unknown>).contentCache = {
      [tabId]: { content: 'fresh hello', cachedAt: freshAt },
    };

    const result = await Storage.getCachedContent(tabId);
    expect(result).toBe('fresh hello');
  });

  test('cleanupCache removes expired entries', async () => {
    const { mock, localData } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const now = Date.now();
    const freshAt = now - 5 * 60 * 1000; // 5min ago
    const expiredAt = now - 2 * 60 * 60 * 1000; // 2h ago

    localData.contentCache = {
      fresh1: { content: 'keep me', cachedAt: freshAt },
      fresh2: { content: 'keep me too', cachedAt: freshAt },
      stale1: { content: 'drop me', cachedAt: expiredAt },
      stale2: { content: 'drop me too', cachedAt: expiredAt },
    };

    await Storage.cleanupCache();

    const remaining = localData.contentCache as Record<string, { content: string; cachedAt: number }>;
    expect(remaining).toHaveProperty('fresh1');
    expect(remaining).toHaveProperty('fresh2');
    expect(remaining).not.toHaveProperty('stale1');
    expect(remaining).not.toHaveProperty('stale2');
  });

  test('getCollections reads legacy sessions when collections empty', async () => {
    const legacySessions = [
      {
        id: 'sess_1',
        title: 'Old Session One',
        description: 'legacy desc',
        createdAt: 1700000000000,
        tabs: [{ url: 'https://example.com', title: 'Example' }],
      },
      {
        id: 'sess_2',
        title: 'Second',
        tabs: [{ url: 'https://test.com', title: 'Test' }],
      },
    ];
    const { mock } = createMockChrome({ sessions: legacySessions });
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const collections = await Storage.getCollections();

    expect(collections).toHaveLength(2);
    expect(collections[0].name).toBe('Old Session One');
    expect(collections[0].id).toBe('sess_1');
    expect(collections[0].tabs[0].url).toBe('https://example.com');
    expect(collections[0].description).toBe('legacy desc');
    expect(collections[1].name).toBe('Second');
  });

  test('getCollections prefers collections over legacy sessions', async () => {
    const collections = [{ id: 'col_1', name: 'Current', description: '', createdAt: 1, tabs: [] }];
    const sessions = [{ id: 'sess_1', title: 'Legacy Should Be Ignored', tabs: [] }];
    const { mock } = createMockChrome({ collections, sessions });
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const result = await Storage.getCollections();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Current');
  });

  test('save/reload round-trip preserves id,name,description,createdAt,tabs{url,title}', async () => {
    const { mock } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const col = {
      id: 'col_abc123',
      name: 'My Trip',
      description: 'Planning a vacation',
      createdAt: 1710000000000,
      tabs: [
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com/page?q=1', title: 'B Page' },
      ],
    };

    await Storage.saveCollections([col]);

    const reloaded = await Storage.getCollections();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(col.id);
    expect(reloaded[0].name).toBe(col.name);
    expect(reloaded[0].description).toBe(col.description);
    expect(reloaded[0].createdAt).toBe(col.createdAt);
    expect(reloaded[0].tabs).toEqual(col.tabs);

    const single = await Storage.getCollection('col_abc123');
    expect(single?.name).toBe('My Trip');
    expect(single?.tabs).toHaveLength(2);
  });

  test('getSettings/saveSettings round-trip preserves apiKey and darkMode', async () => {
    const { mock } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const defaults = await Storage.getSettings();
    expect(defaults).toEqual({ apiKey: '', darkMode: false });

    await Storage.saveSettings({ apiKey: 'sk-test-123', darkMode: true });
    const saved = await Storage.getSettings();
    expect(saved).toEqual({ apiKey: 'sk-test-123', darkMode: true });
  });

  test('constants GROUP_COLORS includes grey and pinned values are correct', async () => {
    const { GROUP_COLORS, BATCH_SIZE, CONTENT_TTL, CONTENT_LIMIT, STORAGE_KEYS } =
      await import('../src/shared/constants/index.js');
    expect(GROUP_COLORS).toContain('grey');
    expect(GROUP_COLORS).toHaveLength(9);
    expect(BATCH_SIZE).toBe(5);
    expect(CONTENT_TTL).toBe(3600000);
    expect(CONTENT_LIMIT).toBe(50000);
    expect(STORAGE_KEYS.legacySessions).toBe('sessions');
    expect(STORAGE_KEYS.collections).toBe('collections');
  });
});

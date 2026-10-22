import { describe, test, expect, beforeEach, vi } from 'vitest';

function createMockChrome(
  initialLocal: Record<string, unknown> = {},
  initialSync: Record<string, unknown> = {},
) {
  const localData: Record<string, unknown> = { ...initialLocal };
  const syncData: Record<string, unknown> = { ...initialSync };
  function handleGet(store: Record<string, unknown>, keys: unknown): Record<string, unknown> {
    if (keys === null || keys === undefined || (Array.isArray(keys) && keys.length === 0)) return { ...store };
    if (typeof keys === 'string') return { [keys]: store[keys] };
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const k of keys as string[]) out[k] = store[k];
      return out;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(keys as Record<string, unknown>)) out[k] = store[k] ?? (keys as Record<string, unknown>)[k];
    return out;
  }
  const mock = {
    storage: {
      local: {
        _data: localData,
        get: vi.fn(async (keys?: unknown) => handleGet(localData, keys)),
        set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(localData, data); }),
      },
      sync: {
        _data: syncData,
        get: vi.fn(async (keys?: unknown) => handleGet(syncData, keys)),
        set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(syncData, data); }),
      },
    },
  };
  return { mock, localData, syncData };
}

function installChrome(mock: ReturnType<typeof createMockChrome>['mock']) {
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
}

describe('compat — storage compatibility with legacy data', () => {
  beforeEach(() => vi.useRealTimers());

  test('seed legacy sessions → getCollections returns mapped legacy', async () => {
    const legacySessions = [
      { id: 'sess_1', title: 'Old Session', description: 'desc', createdAt: 1700000000000, tabs: [{ url: 'https://example.com', title: 'Example' }] },
      { id: 'sess_2', title: 'Second Title', tabs: [{ url: 'https://test.com', title: 'Test' }] },
    ];
    const { mock } = createMockChrome({ sessions: legacySessions });
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');
    const cols = await Storage.getCollections();
    expect(cols).toHaveLength(2);
    expect(cols[0].id).toBe('sess_1');
    expect(cols[0].name).toBe('Old Session');
    expect(cols[0].description).toBe('desc');
    expect(cols[0].tabs[0].url).toBe('https://example.com');
    expect(cols[1].name).toBe('Second Title');
  });

  test('seed 60-min-old contentCache → getCachedContent returns null and cleanup removes it', async () => {
    const { mock, localData } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    const expiredAt = Date.now() - 61 * 60 * 1000; // 61 min ago (TTL 3600000)
    const freshAt = Date.now() - 5 * 60 * 1000;
    localData.contentCache = {
      stale: { content: 'old content', cachedAt: expiredAt },
      fresh: { content: 'keep me', cachedAt: freshAt },
    };

    expect(await Storage.getCachedContent('stale')).toBeNull();
    expect(await Storage.getCachedContent('fresh')).toBe('keep me');

    await Storage.cleanupCache();
    const remaining = localData.contentCache as Record<string, { content: string; cachedAt: number }>;
    expect(remaining).not.toHaveProperty('stale');
    expect(remaining).toHaveProperty('fresh');
  });

  test('darkMode round-trips via getSettings/saveSettings', async () => {
    const { mock } = createMockChrome();
    installChrome(mock);
    vi.resetModules();
    const { Storage } = await import('../src/shared/storage/index.js');

    expect(await Storage.getSettings()).toMatchObject({ apiKey: '', darkMode: false });

    await Storage.saveSettings({ apiKey: 'sk-test-123', darkMode: true });
    expect(await Storage.getSettings()).toMatchObject({ apiKey: 'sk-test-123', darkMode: true });

    await Storage.saveSettings({ apiKey: 'sk-test-123', darkMode: false });
    expect(await Storage.getSettings()).toMatchObject({ apiKey: 'sk-test-123', darkMode: false });
  });
});

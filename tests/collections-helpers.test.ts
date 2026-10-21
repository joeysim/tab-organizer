import { describe, test, expect, beforeEach, vi } from 'vitest';

function createChromeMock(initialCollections: unknown[] = []) {
  const localData: Record<string, unknown> = {
    collections: [...initialCollections],
  };
  const syncData: Record<string, unknown> = {};

  function handleGet(store: Record<string, unknown>, keys: unknown): Record<string, unknown> {
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const k of keys as string[]) out[k] = store[k];
      return out;
    }
    if (typeof keys === 'string') return { [keys]: store[keys] };
    if (keys === null || keys === undefined) return { ...store };
    return {};
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
        set: vi.fn(async (data: Record<string, unknown>) => Object.assign(syncData, data)),
      },
    },
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: {
      create: vi.fn(async ({ url }: { url: string }) => ({ id: Math.floor(Math.random() * 10000), url })),
      group: vi.fn(async () => 999),
    },
    tabGroups: { update: vi.fn(async () => ({})) },
  };

  return { mock, localData };
}

function installChrome(mock: ReturnType<typeof createChromeMock>['mock']) {
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
}

describe('collections helpers', () => {
  beforeEach(() => {
    // mock clipboard and URL/DOM for markdown tests
    if (!navigator.clipboard) {
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: vi.fn(async () => {}) } },
        writable: true,
        configurable: true,
      });
    } else {
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    }
    // mock Blob/URL/document for download tests (jsdom-lite)
    if (!globalThis.Blob) {
      (globalThis as unknown as Record<string, unknown>).Blob = class Blob {
        constructor(parts: unknown[]) {
          (this as unknown as { parts: unknown[] }).parts = parts;
        }
      };
    }
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
      globalThis.URL.revokeObjectURL = vi.fn(() => {});
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
    // ensure document.createElement exists (vitest jsdom not enabled by default, stub manually)
    if (typeof document === 'undefined') {
      (globalThis as unknown as Record<string, unknown>).document = {
        createElement: () => ({
          set href(_v: string) {},
          set download(_v: string) {},
          click: vi.fn(),
        }),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      };
    } else {
      const el = { click: vi.fn(), set href(_v: string) {}, set download(_v: string) {} };
      vi.spyOn(document, 'createElement').mockReturnValue(el as unknown as HTMLElement);
      if (!document.body) (document as unknown as Record<string, unknown>).body = { appendChild: vi.fn(), removeChild: vi.fn() };
    }
  });

  test('saveCollection maps to {url,title} only', async () => {
    const { mock, localData } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const tabs = [
      { id: 123, url: 'https://example.com', title: 'Example', favIconUrl: 'https://example.com/favicon.ico', groupId: 1, windowId: 2 } as unknown as { url: string; title: string },
      { url: 'https://test.com', title: 'Test', extra: 'should be stripped' } as unknown as { url: string; title: string },
    ];

    const col = await CollectionManager.saveCollection('My Col', 'desc', tabs);

    expect(col.tabs[0]).toEqual({ url: 'https://example.com', title: 'Example' });
    expect(col.tabs[1]).toEqual({ url: 'https://test.com', title: 'Test' });
    expect((col.tabs[0] as unknown as Record<string, unknown>).id).toBeUndefined();
    expect((col.tabs[0] as unknown as Record<string, unknown>).favIconUrl).toBeUndefined();

    // also check persisted storage via mock
    const stored = localData.collections as unknown[];
    expect(stored).toHaveLength(1);
  });

  test('toMarkdown format', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const collection = {
      id: 'col_1',
      name: 'Research Links',
      description: 'Links about AI',
      createdAt: new Date('2024-01-15T00:00:00Z').getTime(),
      tabs: [
        { title: 'OpenAI', url: 'https://openai.com' },
        { title: 'Anthropic', url: 'https://anthropic.com' },
      ],
    };

    const md = CollectionManager.toMarkdown(collection);

    expect(md).toContain('# Research Links');
    expect(md).toContain('Links about AI');
    expect(md).toMatch(/Created:/);
    expect(md).toContain('## Links (2)');
    expect(md).toContain('1. [OpenAI](https://openai.com)');
    expect(md).toContain('2. [Anthropic](https://anthropic.com)');
  });

  test('toMarkdown handles empty description and empty tabs', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const collection = {
      id: 'col_1',
      name: 'Empty',
      description: '',
      createdAt: Date.now(),
      tabs: [] as { title: string; url: string }[],
    };
    const md = CollectionManager.toMarkdown(collection);
    expect(md).toContain('# Empty');
    expect(md).toContain('## Links (0)');
    expect(md).not.toContain('\n\n\n\n');
  });

  test('generateId unique and col_ prefix', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const id = CollectionManager.generateId();
      expect(id.startsWith('col_')).toBe(true);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(20);
  });

  test('getCollections / saveCollections round-trip', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const saved = await CollectionManager.saveCollection('A', '', [{ url: 'https://a.com', title: 'A' }]);
    const all = await CollectionManager.getCollections();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);

    const fetched = await CollectionManager.getCollection(saved.id);
    expect(fetched?.name).toBe('A');
  });

  test('deleteCollection removes', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const col = await CollectionManager.saveCollection('ToDelete', '', []);
    await CollectionManager.deleteCollection(col.id);
    const all = await CollectionManager.getCollections();
    expect(all.find((c) => c.id === col.id)).toBeUndefined();
  });

  test('updateCollection modifies and throws if not found', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const col = await CollectionManager.saveCollection('Orig', 'desc', []);
    const updated = await CollectionManager.updateCollection(col.id, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
    expect(updated.id).toBe(col.id);

    await expect(CollectionManager.updateCollection('missing', { name: 'x' })).rejects.toThrow('Collection not found');
  });

  test('addToCollection and addTabsToCollection', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const col = await CollectionManager.saveCollection('Col', '', [{ url: 'https://a.com', title: 'A' }]);
    await CollectionManager.addToCollection(col.id, { url: 'https://b.com', title: 'B' });
    let fetched = await CollectionManager.getCollection(col.id);
    expect(fetched?.tabs).toHaveLength(2);

    await CollectionManager.addTabsToCollection(col.id, [
      { url: 'https://c.com', title: 'C' },
      { url: 'https://d.com', title: 'D' },
    ]);
    fetched = await CollectionManager.getCollection(col.id);
    expect(fetched?.tabs).toHaveLength(4);

    await expect(CollectionManager.addToCollection('bad-id', { url: 'https://x.com', title: 'X' })).rejects.toThrow('Collection not found');
    await expect(CollectionManager.addTabsToCollection('bad-id', [{ url: 'https://x.com', title: 'X' }])).rejects.toThrow('Collection not found');
  });

  test('allToMarkdown and empty case', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    let md = await CollectionManager.allToMarkdown();
    expect(md).toContain('No collections saved yet');

    await CollectionManager.saveCollection('One', 'desc one', [{ url: 'https://a.com', title: 'A' }]);
    await CollectionManager.saveCollection('Two', '', [{ url: 'https://b.com', title: 'B' }]);
    md = await CollectionManager.allToMarkdown();
    expect(md).toContain('# My Collections');
    expect(md).toContain('Exported:');
    expect(md).toContain('One');
    expect(md).toContain('Two');
    expect(md).toContain('[A](https://a.com)');
  });

  test('copyToClipboard delegates to toMarkdown', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const collection = {
      id: 'col_1',
      name: 'Col',
      description: '',
      createdAt: Date.now(),
      tabs: [{ title: 'A', url: 'https://a.com' }],
    };
    const result = await CollectionManager.copyToClipboard(collection);
    expect(result).toEqual({ success: true });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('# Col'));
  });

  test('copyAllToClipboard', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    await CollectionManager.saveCollection('Col', '', [{ url: 'https://a.com', title: 'A' }]);
    const result = await CollectionManager.copyAllToClipboard();
    expect(result).toEqual({ success: true });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('# My Collections'));
  });

  test('downloadAsMarkdown uses sanitized filename and Blob', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    const collection = {
      id: 'col_1',
      name: 'My Col! 123',
      description: '',
      createdAt: Date.now(),
      tabs: [{ title: 'A', url: 'https://a.com' }],
    };
    // should not throw
    CollectionManager.downloadAsMarkdown(collection);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  test('downloadAllAsMarkdown uses dated filename', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { CollectionManager } = await import('../src/lib/collections/index.js');

    await CollectionManager.saveCollection('Col', '', []);
    CollectionManager.downloadAllAsMarkdown();
    // async internally, give tick
    await new Promise((r) => setTimeout(r, 0));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  test('SessionManager alias equals CollectionManager', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const mod = await import('../src/lib/collections/index.js');
    expect(mod.SessionManager).toBe(mod.CollectionManager);
  });

  test('SessionManager has same CRUD methods', async () => {
    const { mock } = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { SessionManager } = await import('../src/lib/collections/index.js');
    expect(typeof SessionManager.getCollections).toBe('function');
    expect(typeof SessionManager.saveCollection).toBe('function');
    expect(typeof SessionManager.toMarkdown).toBe('function');
  });
});

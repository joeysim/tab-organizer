import { describe, test, expect, beforeEach, vi } from 'vitest';

function createChromeMock() {
  const localData: Record<string, unknown> = {};
  const syncData: Record<string, unknown> = {};
  const contentCache: Record<string, { content: string; cachedAt: number }> = {};

  return {
    storage: {
      local: {
        get: vi.fn(async (keys?: unknown) => {
          if (Array.isArray(keys) && (keys as string[]).includes('contentCache')) {
            return { contentCache };
          }
          if (typeof keys === 'string') return { [keys]: localData[keys] };
          // handle array
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys as string[]) out[k] = localData[k];
            return out;
          }
          return {};
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(localData, data);
          if (data.contentCache) Object.assign(contentCache, data.contentCache as Record<string, unknown>);
        }),
        _data: localData,
        _contentCache: contentCache,
      },
      sync: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
        _data: syncData,
      },
    },
    runtime: {
      sendMessage: vi.fn(async () => ({ success: true, content: 'fetched content' })),
    },
  };
}

function installChrome(mock: ReturnType<typeof createChromeMock>) {
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
}

describe('search scoring', () => {
  beforeEach(() => {
    const mock = createChromeMock();
    installChrome(mock);
    vi.resetModules();
  });

  test('title exact 150', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    expect(Search.scoreTab({ id: 1, title: 'github', url: 'https://example.com' }, ['github'])).toBe(150);
  });

  test('title partial 100', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    // title contains term but not exact
    expect(Search.scoreTab({ id: 1, title: 'GitHub Dashboard', url: 'https://example.com' }, ['github'])).toBe(100);
  });

  test('url 50', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    // title does not match, url path matches but domain does not => only 50
    expect(Search.scoreTab({ id: 1, title: 'Other', url: 'https://example.com/github' }, ['github'])).toBe(50);
  });

  test('domain bonus 30 on top of url 50 = 80', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    // url includes term + domain includes term => 50+30
    const score = Search.scoreTab({ id: 1, title: 'Other', url: 'https://github.com/foo' }, ['github']);
    expect(score).toBe(80);
  });

  test('domain bonus alone when url matches domain', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const score = Search.scoreTab({ id: 1, url: 'https://example.com/path' }, ['example']);
    // url 50 + domain 30 = 80
    expect(score).toBe(80);
  });

  test('groupName 40', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    expect(Search.scoreTab({ id: 1, title: 'Other', url: 'https://other.com', groupName: 'Work Stuff' }, ['work'])).toBe(40);
  });

  test('_cachedContent 30', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    expect(Search.scoreTab({ id: 1, title: 'Other', url: 'https://other.com', _cachedContent: 'this has work inside' }, ['work'])).toBe(30);
  });

  test('multi-term sum', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    // two terms each title partial 100 => 200
    const score = Search.scoreTab(
      { id: 1, title: 'GitHub Dashboard', url: 'https://other.com' },
      ['github', 'dashboard'],
    );
    expect(score).toBe(200);
  });

  test('empty query returns all tabs unfiltered', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];
    expect(Search.searchTabs(tabs, '')).toEqual(tabs);
    expect(Search.searchTabs(tabs, '   ')).toEqual(tabs);
  });

  test('searchTabs sorts desc by score and attaches _searchScore', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [
      { id: 1, title: 'Other', url: 'https://github.com/a' }, // 80 (url+domain)
      { id: 2, title: 'github', url: 'https://example.com' }, // 150 exact
      { id: 3, title: 'GitHub Issues', url: 'https://example.com' }, // 100 partial
    ];
    const results = Search.searchTabs(tabs, 'github');
    expect(results).toHaveLength(3);
    expect((results[0] as unknown as { id: number }).id).toBe(2);
    expect((results[1] as unknown as { id: number }).id).toBe(3);
    expect((results[2] as unknown as { id: number }).id).toBe(1);
    expect((results[0] as unknown as { _searchScore: number })._searchScore).toBe(150);
    expect((results[2] as unknown as { _searchScore: number })._searchScore).toBe(80);
  });

  test('searchTabs filters non-matching tabs', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: 'Google', url: 'https://google.com' },
    ];
    const results = Search.searchTabs(tabs, 'github');
    expect(results).toHaveLength(1);
    expect((results[0] as unknown as { id: number }).id).toBe(1);
  });

  test('searchWithContent short-circuits at 3 without loading content', async () => {
    const mock = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [
      { id: 1, title: 'github a', url: 'https://a.com' },
      { id: 2, title: 'github b', url: 'https://b.com' },
      { id: 3, title: 'github c', url: 'https://c.com' },
      { id: 4, title: 'github d', url: 'https://d.com' },
    ];
    const results = await Search.searchWithContent(tabs, 'github');
    expect(results).toHaveLength(4); // all 4 match, >=3 triggers early return
    expect(mock.storage.local.get).not.toHaveBeenCalledWith(['contentCache']);
  });

  test('searchWithContent falls back to content search when <3 results', async () => {
    const mock = createChromeMock();
    // seed content cache for tab 2 that contains the term
    (mock.storage.local as unknown as { _contentCache: Record<string, unknown> })._contentCache['2'] = {
      content: 'secret term here',
      cachedAt: Date.now(),
    };
    // also make localData reflect it so get returns it
    (mock.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(async (keys?: unknown) => {
      if (Array.isArray(keys) && (keys as string[]).includes('contentCache')) {
        return {
          contentCache: {
            '2': { content: 'secret term here', cachedAt: Date.now() },
          },
        };
      }
      return {};
    });
    installChrome(mock);
    vi.resetModules();
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [
      { id: 1, title: 'Alpha', url: 'https://a.com' },
      { id: 2, title: 'Beta', url: 'https://b.com' },
    ];
    const results = await Search.searchWithContent(tabs, 'secret');
    // only tab 2 has cached content match
    expect(results).toHaveLength(1);
    expect((results[0] as unknown as { id: number }).id).toBe(2);
  });

  test('highlightMatches wraps terms with <mark>', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    expect(Search.highlightMatches('Hello world', 'hello')).toBe('<mark>Hello</mark> world');
    expect(Search.highlightMatches('foo bar baz', 'bar')).toBe('foo <mark>bar</mark> baz');
  });

  test('highlightMatches handles multiple terms', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    const result = Search.highlightMatches('GitHub Dashboard', 'github dashboard');
    expect(result).toContain('<mark>GitHub</mark>');
    expect(result).toContain('<mark>Dashboard</mark>');
  });

  test('escapeRegex escapes special chars', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    expect(Search.escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?');
    expect(Search.escapeRegex('[test]')).toBe('\\[test\\]');
    expect(Search.escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  test('scoring combined: title partial 100 + url 50 + domain 30 + groupName 40 + content 30', async () => {
    const { Search } = await import('../src/lib/search/index.js');
    // term present everywhere
    const tab = {
      id: 1,
      title: 'my work project',
      url: 'https://work.example.com/work',
      groupName: 'work group',
      _cachedContent: 'work work work',
    };
    // title partial 100, url 50, domain 30 (work.example.com), group 40, content 30 = 250
    expect(Search.scoreTab(tab, ['work'])).toBe(250);
  });

  test('loadContentForTabs attaches _cachedContent from Storage', async () => {
    const mock = createChromeMock();
    (mock.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(async (keys?: unknown) => {
      if (Array.isArray(keys) && (keys as string[]).includes('contentCache')) {
        return {
          contentCache: {
            '1': { content: 'cached hello', cachedAt: Date.now() },
          },
        };
      }
      return {};
    });
    installChrome(mock);
    vi.resetModules();
    const { Search } = await import('../src/lib/search/index.js');
    const tabs = [{ id: 1, title: 'A', url: 'https://a.com' }];
    const withContent = await Search.loadContentForTabs(tabs);
    expect((withContent[0] as unknown as { _cachedContent: string })._cachedContent).toBe('cached hello');
  });

  test('extractAndCacheContent uses chrome.runtime.sendMessage and caches', async () => {
    const mock = createChromeMock();
    installChrome(mock);
    vi.resetModules();
    const { Search } = await import('../src/lib/search/index.js');
    const content = await Search.extractAndCacheContent(42);
    expect(content).toBe('fetched content');
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ action: 'getContent', tabId: 42 });
    expect(mock.storage.local.set).toHaveBeenCalled();
  });
});

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

function mockChrome() {
  return {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
    runtime: { sendMessage: vi.fn(async () => ({})) },
  };
}

describe('AI', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    const chromeMock = mockChrome();
    (globalThis as unknown as Record<string, unknown>).chrome = chromeMock as unknown as typeof chrome;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('buildPrompt includes [ID:...] lines', async () => {
    const { buildPrompt } = await import('../src/lib/ai/prompts/organize.js');
    const tabs = [
      { id: 123, title: 'GitHub', url: 'https://github.com' },
      { id: 456, title: 'Google', url: 'https://google.com' },
    ];
    const prompt = buildPrompt(tabs);
    expect(prompt).toContain('[ID:123]');
    expect(prompt).toContain('[ID:456]');
    expect(prompt).toContain('GitHub');
    // URLs are compacted to hostname (+ up to 2 path segments) to save tokens
    expect(prompt).toContain('github.com');
  });

  test('parseResponse strips ```json fences', async () => {
    const { parseResponse } = await import('../src/lib/ai/claude.js');
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
      { id: 3, title: 'C', url: 'https://c.com' },
    ];
    const fenced = '```json\n{"groups":[{"name":"Test","color":"blue","tabIds":[1,2]}]}\n```';
    const result = parseResponse(fenced, tabs);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].tabs).toEqual([1, 2]);
  });

  test('parseResponse strips ``` fences without json hint', async () => {
    const { parseResponse } = await import('../src/lib/ai/claude.js');
    const tabs = [
      { id: 10, title: 'A', url: 'https://a.com' },
      { id: 20, title: 'B', url: 'https://b.com' },
    ];
    const fenced = '```\n{"groups":[{"name":"G","color":"red","tabIds":[10,20]}]}\n```';
    const result = parseResponse(fenced, tabs);
    expect(result.groups[0].tabs).toEqual([10, 20]);
  });

  test('parseResponse validates tabIds and filters groups<2', async () => {
    const { parseResponse } = await import('../src/lib/ai/claude.js');
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];
    const content = JSON.stringify({
      groups: [
        { name: 'Valid', color: 'blue', tabIds: [1, 2] },
        { name: 'TooSmall', color: 'red', tabIds: [1] },
        { name: 'InvalidIds', color: 'green', tabIds: [999, 2] },
      ],
    });
    const result = parseResponse(content, tabs);
    // InvalidIds after filtering becomes [2] length 1 => filtered out, TooSmall filtered, only Valid remains
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe('Valid');
    expect(result.groups[0].tabs).toEqual([1, 2]);
  });

  test('parseResponse handles tabs key alternative', async () => {
    const { parseResponse } = await import('../src/lib/ai/claude.js');
    const tabs = [
      { id: 5, title: 'A', url: 'https://a.com' },
      { id: 6, title: 'B', url: 'https://b.com' },
    ];
    const content = JSON.stringify({
      groups: [{ name: 'Alt', color: 'blue', tabs: [5, 6] }],
    });
    const result = parseResponse(content, tabs);
    expect(result.groups[0].tabs).toEqual([5, 6]);
  });

  test('validateColor normalizes valid colors and defaults to blue', async () => {
    const { validateColor } = await import('../src/lib/ai/claude.js');
    expect(validateColor('Blue')).toBe('blue');
    expect(validateColor('  RED  ')).toBe('red');
    expect(validateColor('grey')).toBe('grey');
    expect(validateColor('invalid')).toBe('blue');
    expect(validateColor('')).toBe('blue');
    expect(validateColor(undefined)).toBe('blue');
  });

  test('organizeTabs throws if no apiKey', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], '')).rejects.toThrow(
      'API key is required',
    );
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], undefined as unknown as string)).rejects.toThrow(
      'API key is required',
    );
  });

  test('organizeTabs returns empty groups for empty tabs', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}), status: 200 }) as unknown as Response);
    const result = await ClaudeProvider.organizeTabs([], 'sk-test');
    expect(result).toEqual({ groups: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('organizeTabs handles 401', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      }) as unknown as Response,
    );
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], 'bad-key')).rejects.toThrow(
      'Invalid API key',
    );
  });

  test('organizeTabs handles API error without message', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }) as unknown as Response,
    );
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], 'key')).rejects.toThrow(
      'API error: 500',
    );
  });

  test('organizeTabs handles empty text response', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ text: '' }] }),
      }) as unknown as Response,
    );
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], 'key')).rejects.toThrow(
      'Empty response from API',
    );
  });

  test('organizeTabs handles missing content array', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ content: [] }),
      }) as unknown as Response,
    );
    await expect(ClaudeProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], 'key')).rejects.toThrow(
      'Empty response from API',
    );
  });

  test('organizeTabs sends correct headers and body', async () => {
    const { ClaudeProvider } = await import('../src/lib/ai/claude.js');
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ text: JSON.stringify({ groups: [{ name: 'G', color: 'blue', tabIds: [1, 2] }] }) }],
        }),
      }) as unknown as Response,
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];
    await ClaudeProvider.organizeTabs(tabs, 'sk-test-key');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.max_tokens).toBe(2048);
  });

  test('quickCategorize groups by URL patterns unchanged', async () => {
    const { quickCategorize } = await import('../src/lib/ai/categorize.js');
    const tabs = [
      { id: 1, title: 'GitHub Repo', url: 'https://github.com/foo' },
      { id: 2, title: 'StackOverflow', url: 'https://stackoverflow.com/q' },
      { id: 3, title: 'Amazon Shop', url: 'https://amazon.com/item' },
      { id: 4, title: 'Amazon Prime', url: 'https://amazon.com/prime' },
      { id: 5, title: 'Unknown', url: 'https://random.example.com' },
    ];
    const result = quickCategorize(tabs);
    // Development 2 tabs, Shopping 2 tabs => 2 groups, Other/Unknown single filtered
    expect(result.groups.length).toBe(2);
    const dev = result.groups.find((g) => g.name === 'Development');
    expect(dev?.tabs).toEqual(expect.arrayContaining([1, 2]));
    expect(dev?.color).toBe('purple');
    const shop = result.groups.find((g) => g.name === 'Shopping');
    expect(shop?.tabs).toEqual(expect.arrayContaining([3, 4]));
  });

  test('quickCategorize fallback behavior: empty key not triggered, patterns deterministic', async () => {
    const { quickCategorize } = await import('../src/lib/ai/categorize.js');
    // all tabs unknown pattern but at least 2 => Other group
    const tabs = [
      { id: 1, title: 'Foo', url: 'https://foo.example.com' },
      { id: 2, title: 'Bar', url: 'https://bar.example.com' },
    ];
    const result = quickCategorize(tabs);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe('Other');
    expect(result.groups[0].color).toBe('grey');
  });

  test('AI compat object exposes same shape', async () => {
    const { AI } = await import('../src/lib/ai/claude.js');
    expect(typeof AI.organizeTabs).toBe('function');
    expect(typeof AI.buildPrompt).toBe('function');
    expect(typeof AI.parseResponse).toBe('function');
    expect(typeof AI.validateColor).toBe('function');
    expect(typeof AI.quickCategorize).toBe('function');
  });
});

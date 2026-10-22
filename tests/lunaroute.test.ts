import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

describe('LunaRouteProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('sends Bearer auth to gateway with openai-responses shape', async () => {
    const { LunaRouteProvider, LUNAROUTE_API_URL, LUNAROUTE_MODEL } = await import(
      '../src/lib/ai/lunaroute.js'
    );
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({ groups: [{ name: 'G', color: 'blue', tabIds: [1, 2] }] }),
        }),
      }) as unknown as Response,
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ];
    const result = await LunaRouteProvider.organizeTabs(tabs, 'lr-test-key');
    expect(result.groups).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LUNAROUTE_API_URL);
    expect(url).toBe('https://gw.lunaroute.com/v1/responses');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer lr-test-key');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe(LUNAROUTE_MODEL);
    expect(body.input).toContain('[ID:1]');
  });

  test('parses output array fallback', async () => {
    const { LunaRouteProvider } = await import('../src/lib/ai/lunaroute.js');
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify({ groups: [{ name: 'X', color: 'red', tabIds: [10, 20] }] }) }],
            },
          ],
        }),
      }) as unknown as Response,
    ) as unknown as typeof fetch;

    const tabs = [
      { id: 10, title: 'A', url: 'https://a.com' },
      { id: 20, title: 'B', url: 'https://b.com' },
    ];
    const result = await LunaRouteProvider.organizeTabs(tabs, 'k');
    expect(result.groups[0].name).toBe('X');
    expect(result.groups[0].color).toBe('red');
  });

  test('throws on missing apiKey and empty tabs short-circuit', async () => {
    const { LunaRouteProvider } = await import('../src/lib/ai/lunaroute.js');
    await expect(LunaRouteProvider.organizeTabs([{ id: 1, title: 'A', url: 'https://a.com' }], '')).rejects.toThrow(
      'API key is required',
    );
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}), status: 200 }) as unknown as Response) as unknown as typeof fetch;
    const empty = await LunaRouteProvider.organizeTabs([], 'k');
    expect(empty).toEqual({ groups: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

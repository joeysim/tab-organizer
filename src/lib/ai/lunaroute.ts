import type { AIProvider, TabInput, GroupSuggestion } from './provider.js';
import { buildPrompt } from './prompts/organize.js';
import { parseResponse } from './claude.js';

export const LUNAROUTE_API_URL = 'https://gw.lunaroute.com/v1/responses';
export const LUNAROUTE_MODEL = 'gpt-4o-mini';

function extractText(result: unknown): string | undefined {
  const r = result as Record<string, unknown>;
  // 1. aggregated output_text (openai responses convenience field)
  if (typeof r.output_text === 'string' && r.output_text) return r.output_text;
  // 2. output array: [{type:'message', content:[{type:'output_text', text:'...'}]}]
  if (Array.isArray(r.output)) {
    for (const item of r.output as Array<Record<string, unknown>>) {
      const content = item.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c.text === 'string' && c.text) return c.text as string;
        }
      }
      // some gateways flatten to {text:...}
      if (typeof item.text === 'string' && item.text) return item.text as string;
    }
  }
  // 3. chat/completions compat: {choices:[{message:{content:'...'}}]}
  const choices = r.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices)) {
    const msg = (choices[0]?.message as Record<string, unknown> | undefined)?.content;
    if (typeof msg === 'string' && msg) return msg;
  }
  // 4. anthropic compat fallback
  const content = r.content as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(content) && typeof content[0]?.text === 'string') return content[0]!.text as string;
  return undefined;
}

export const LunaRouteProvider: AIProvider = {
  name: 'lunaroute',

  async organizeTabs(tabs: TabInput[], apiKey: string): Promise<{ groups: GroupSuggestion[] }> {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (tabs.length === 0) {
      return { groups: [] };
    }

    const prompt = buildPrompt(tabs);

    const response = await fetch(LUNAROUTE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: LUNAROUTE_MODEL,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const error = await (response.json() as Promise<Record<string, unknown>>).catch(() => ({}));
      const msg =
        (error as { error?: { message?: string } }).error?.message || `API error: ${response.status}`;
      throw new Error(msg);
    }

    const result = (await response.json()) as unknown;
    const content = extractText(result);

    if (!content) {
      throw new Error('Empty response from API');
    }

    return parseResponse(content, tabs);
  },
};

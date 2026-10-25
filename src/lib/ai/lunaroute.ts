import type { AIProvider, TabInput, GroupSuggestion } from './provider.js';
import { buildPrompt } from './prompts/organize.js';
import { buildPlanPrompt } from './prompts/plan.js';
import { parsePlanResponse } from './tools.js';
import type { PlanTab, ResolvedPlan } from './tools.js';
import { parseResponse } from './claude.js';

export const LUNAROUTE_API_URL = 'https://gw.lunaroute.com/v1/responses';
export const LUNAROUTE_MODEL = 'muse-spark-open';
export const LUNAROUTE_MODELS = ['muse-spark-open', 'glm-5.3-flash', 'glm-5.3', 'muse-spark-open-background'] as const;
export const LUNAROUTE_TIMEOUT_MS = 45_000;

function extractText(result: unknown): string | undefined {
  const r = result as Record<string, unknown>;
  // 1. aggregated output_text (openai responses convenience field)
  if (typeof r.output_text === 'string' && r.output_text) return r.output_text;
  // 2. output array: [{type:'reasoning',...}, {type:'message', content:[{type:'output_text', text:'...'}]}]
  // Reasoning models emit reasoning items (content[].type === 'reasoning_text') before the message;
  // skip those so we don't hand the model's thinking prose to parseResponse.
  if (Array.isArray(r.output)) {
    const items = (r.output as Array<Record<string, unknown>>).filter((item) => item.type !== 'reasoning');
    const texts: string[] = [];
    for (const item of items) {
      const content = item.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c.type && c.type !== 'output_text' && c.type !== 'text') continue;
          if (typeof c.text === 'string' && c.text) texts.push(c.text as string);
        }
      } else if (typeof item.text === 'string' && item.text) {
        // some gateways flatten to {text:...}
        texts.push(item.text as string);
      }
    }
    if (texts.length) return texts.join('');
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

  async organizeTabs(tabs: TabInput[], apiKey: string, opts?: { signal?: AbortSignal }): Promise<{ groups: GroupSuggestion[] }> {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (tabs.length === 0) {
      return { groups: [] };
    }

    const prompt = buildPrompt(tabs);
    const signal = opts?.signal
      ? AbortSignal.any([AbortSignal.timeout(LUNAROUTE_TIMEOUT_MS), opts.signal])
      : AbortSignal.timeout(LUNAROUTE_TIMEOUT_MS);

    const base = { model: LUNAROUTE_MODEL, input: prompt, max_output_tokens: 4096 };
    const post = (body: Record<string, unknown>) =>
      fetch(LUNAROUTE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

    // cut reasoning where the backend honours it; retry plainly if it rejects the param
    let response = await post({ ...base, reasoning: { effort: 'low' } });
    if (response.status === 400) response = await post(base);

    if (!response.ok) {
      const error = await (response.json() as Promise<Record<string, unknown>>).catch(() => ({}));
      const msg =
        (error as { error?: { message?: string } }).error?.message || `API error: ${response.status}`;
      throw new Error(msg);
    }

    const result = (await response.json()) as Record<string, unknown>;
    if (result.status === 'incomplete') {
      throw new Error('Response was truncated — try again with fewer tabs');
    }
    const content = extractText(result);

    if (!content) {
      console.error('LunaRoute raw result:', JSON.stringify(result).slice(0, 2000));
      throw new Error('Empty response from API');
    }

    try {
      return parseResponse(content, tabs);
    } catch (e) {
      console.error('LunaRoute content that failed parse:', content.slice(0, 2000));
      throw e;
    }
  },

  async planActions(
    request: string,
    tabs: PlanTab[],
    apiKey: string,
    opts?: { signal?: AbortSignal },
  ): Promise<ResolvedPlan> {
    if (!apiKey) throw new Error('API key is required');
    if (tabs.length === 0) return { summary: 'No tabs to work with.', actions: [], skipped: [] };

    const prompt = buildPlanPrompt(request, tabs);
    const signal = opts?.signal
      ? AbortSignal.any([AbortSignal.timeout(LUNAROUTE_TIMEOUT_MS), opts.signal])
      : AbortSignal.timeout(LUNAROUTE_TIMEOUT_MS);
    const base = { model: LUNAROUTE_MODEL, input: prompt, max_output_tokens: 4096 };
    const post = (body: Record<string, unknown>) =>
      fetch(LUNAROUTE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });

    let response = await post({ ...base, reasoning: { effort: 'low' } });
    if (response.status === 400) response = await post(base);
    if (!response.ok) {
      const err = await (response.json() as Promise<Record<string, unknown>>).catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `API error: ${response.status}`,
      );
    }

    const result = (await response.json()) as Record<string, unknown>;
    if (result.status === 'incomplete') throw new Error('Response was truncated — try a narrower request');
    const content = extractText(result);
    if (!content) {
      console.error('LunaRoute plan raw result:', JSON.stringify(result).slice(0, 2000));
      throw new Error('Empty response from API');
    }
    return parsePlanResponse(content, tabs);
  },
};

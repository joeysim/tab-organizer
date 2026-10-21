import type { AIProvider, TabInput, GroupSuggestion } from './provider.js';
import { buildPrompt } from './prompts/organize.js';

export function validateColor(color: unknown): string {
  const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  const normalized = String(color).toLowerCase().trim();
  return validColors.includes(normalized) ? normalized : 'blue';
}

export function parseResponse(content: string, tabs: TabInput[]): { groups: GroupSuggestion[] } {
  let jsonStr = content;

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    if (!parsed.groups || !Array.isArray(parsed.groups)) {
      throw new Error('Invalid response format');
    }

    const validTabIds = new Set(tabs.map((t) => t.id));

    const validatedGroups = (parsed.groups as Array<Record<string, unknown>>)
      .map((group) => ({
        name: String((group.name as string) || 'Untitled'),
        color: validateColor(group.color),
        tabs: ((group.tabIds as number[]) || (group.tabs as number[]) || [])
          .filter((id) => validTabIds.has(Number(id)))
          .map((id) => Number(id)),
      }))
      .filter((group) => group.tabs.length >= 2);

    return { groups: validatedGroups };
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

export const ClaudeProvider: AIProvider = {
  async organizeTabs(tabs: TabInput[], apiKey: string): Promise<{ groups: GroupSuggestion[] }> {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (tabs.length === 0) {
      return { groups: [] };
    }

    const prompt = buildPrompt(tabs);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await (response.json() as Promise<Record<string, unknown>>).catch(() => ({}));
      const msg =
        (error as { error?: { message?: string } }).error?.message || `API error: ${response.status}`;
      throw new Error(msg);
    }

    const result = (await response.json()) as { content?: Array<{ text?: string }> };
    const content = result.content?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from API');
    }

    return parseResponse(content, tabs);
  },
};

// Compat shape matching old global AI object
import { quickCategorize } from './categorize.js';

export const AI = {
  organizeTabs: ClaudeProvider.organizeTabs.bind(ClaudeProvider),
  buildPrompt,
  parseResponse,
  validateColor,
  quickCategorize,
};

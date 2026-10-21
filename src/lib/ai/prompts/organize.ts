import type { TabInput } from '../provider.js';

export function buildPrompt(tabs: TabInput[]): string {
  const tabList = tabs
    .map((tab, index) => `${index + 1}. [ID:${tab.id}] "${tab.title}" - ${tab.url}`)
    .join('\n');

  return `You are a tab organization assistant. Analyze these browser tabs and suggest logical groups.

TABS:
${tabList}

INSTRUCTIONS:
1. Group related tabs by topic, project, or purpose
2. Each group should have 2-10 tabs
3. Use descriptive group names (2-4 words)
4. Choose appropriate colors from: grey, blue, red, yellow, green, pink, purple, cyan, orange
5. Don't create groups with only 1 tab unless it's clearly distinct
6. Ungrouped/unrelated tabs can be left out

RESPOND WITH ONLY VALID JSON in this exact format:
{
  "groups": [
    {
      "name": "Group Name",
      "color": "blue",
      "tabIds": [123, 456, 789]
    }
  ]
}

Important: Use the exact tab IDs from the list above (the numbers after "ID:").`;
}

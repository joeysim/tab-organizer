// AI integration for Claude API tab organization

const AI = {
  // Organize tabs using Claude API
  async organizeTabs(tabs, apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (tabs.length === 0) {
      return { groups: [] };
    }

    const prompt = this.buildPrompt(tabs);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content[0]?.text;

    if (!content) {
      throw new Error('Empty response from API');
    }

    return this.parseResponse(content, tabs);
  },

  // Build prompt for tab organization
  buildPrompt(tabs) {
    const tabList = tabs.map((tab, index) =>
      `${index + 1}. [ID:${tab.id}] "${tab.title}" - ${tab.url}`
    ).join('\n');

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
  },

  // Parse API response to extract groups
  parseResponse(content, tabs) {
    // Try to extract JSON from the response
    let jsonStr = content;

    // Handle markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to parse
    try {
      const parsed = JSON.parse(jsonStr.trim());

      if (!parsed.groups || !Array.isArray(parsed.groups)) {
        throw new Error('Invalid response format');
      }

      // Validate tab IDs
      const validTabIds = new Set(tabs.map(t => t.id));

      const validatedGroups = parsed.groups.map(group => ({
        name: String(group.name || 'Untitled'),
        color: this.validateColor(group.color),
        tabs: (group.tabIds || group.tabs || [])
          .filter(id => validTabIds.has(Number(id)))
          .map(id => Number(id))
      })).filter(group => group.tabs.length >= 2);

      return { groups: validatedGroups };
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      throw new Error('Failed to parse AI response. Please try again.');
    }
  },

  // Validate and normalize color
  validateColor(color) {
    const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const normalized = String(color).toLowerCase().trim();
    return validColors.includes(normalized) ? normalized : 'blue';
  },

  // Quick categorize without AI (fallback/demo)
  quickCategorize(tabs) {
    const categories = {
      'Social Media': [],
      'Development': [],
      'News & Media': [],
      'Shopping': [],
      'Email & Work': [],
      'Entertainment': [],
      'Research': [],
      'Other': []
    };

    const patterns = {
      'Social Media': /facebook|twitter|instagram|linkedin|reddit|tiktok/i,
      'Development': /github|gitlab|stackoverflow|codepen|npm|localhost|127\.0\.0\.1/i,
      'News & Media': /news|cnn|bbc|nytimes|medium|substack/i,
      'Shopping': /amazon|ebay|etsy|shop|store|buy/i,
      'Email & Work': /mail|gmail|outlook|slack|notion|docs\.google|calendar/i,
      'Entertainment': /youtube|netflix|spotify|twitch|hulu|disney/i,
      'Research': /wikipedia|arxiv|scholar|research|edu\./i
    };

    tabs.forEach(tab => {
      let matched = false;
      for (const [category, pattern] of Object.entries(patterns)) {
        if (pattern.test(tab.url) || pattern.test(tab.title)) {
          categories[category].push(tab.id);
          matched = true;
          break;
        }
      }
      if (!matched) {
        categories['Other'].push(tab.id);
      }
    });

    const colorMap = {
      'Social Media': 'blue',
      'Development': 'purple',
      'News & Media': 'orange',
      'Shopping': 'green',
      'Email & Work': 'red',
      'Entertainment': 'pink',
      'Research': 'cyan',
      'Other': 'grey'
    };

    const groups = Object.entries(categories)
      .filter(([_, tabIds]) => tabIds.length >= 2)
      .map(([name, tabIds]) => ({
        name,
        color: colorMap[name],
        tabs: tabIds
      }));

    return { groups };
  }
};

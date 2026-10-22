import type { TabInput } from './provider.js';
import type { GroupSuggestion } from './provider.js';

export function quickCategorize(tabs: TabInput[]): { groups: GroupSuggestion[] } {
  const categories: Record<string, number[]> = {
    'Social Media': [],
    'Development': [],
    'News & Media': [],
    'Shopping': [],
    'Email & Work': [],
    'Entertainment': [],
    'Research': [],
    'Other': [],
  };

  const patterns: Record<string, RegExp> = {
    'Social Media': /facebook|twitter|instagram|linkedin|reddit|tiktok/i,
    'Development': /github|gitlab|stackoverflow|codepen|npm|localhost|127\.0\.0\.1/i,
    'News & Media': /news|cnn|bbc|nytimes|medium|substack/i,
    'Shopping': /amazon|ebay|etsy|shop|store|buy/i,
    'Email & Work': /mail|gmail|outlook|slack|notion|docs\.google|calendar/i,
    'Entertainment': /youtube|netflix|spotify|twitch|hulu|disney/i,
    'Research': /wikipedia|arxiv|scholar|research|edu\./i,
  };

  tabs.forEach((tab) => {
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

  const colorMap: Record<string, string> = {
    'Social Media': 'blue',
    'Development': 'purple',
    'News & Media': 'orange',
    'Shopping': 'green',
    'Email & Work': 'red',
    'Entertainment': 'pink',
    'Research': 'cyan',
    'Other': 'grey',
  };

  const groups = Object.entries(categories)
    .filter(([_, tabIds]) => tabIds.length >= 2)
    .map(([name, tabIds]) => ({
      name,
      color: colorMap[name],
      tabs: tabIds,
    }));

  return { groups };
}

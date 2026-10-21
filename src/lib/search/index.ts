import { Storage } from '../../shared/storage/index.js';

export type SearchableTab = {
  id: number;
  title?: string;
  url?: string;
  groupName?: string | null;
  _cachedContent?: string;
  favIconUrl?: string;
  groupId?: number;
  groupColor?: string | null;
  [key: string]: unknown;
};

export type ScoredTab = SearchableTab & { _searchScore: number };

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text: string, query: string): string {
  if (!query || !text) return text;
  const terms = query.toLowerCase().split(/\s+/);
  let highlighted = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    highlighted = highlighted.replace(regex, '<mark>$1</mark>');
  }
  return highlighted;
}

function scoreTab(tab: SearchableTab, queryTerms: string[]): number {
  let totalScore = 0;

  for (const term of queryTerms) {
    let termScore = 0;

    if (tab.title) {
      const titleLower = tab.title.toLowerCase();
      if (titleLower === term) {
        termScore += 150;
      } else if (titleLower.includes(term)) {
        termScore += 100;
      }
    }

    if (tab.url) {
      const urlLower = tab.url.toLowerCase();
      if (urlLower.includes(term)) {
        termScore += 50;
      }
      try {
        const domain = new URL(tab.url).hostname.toLowerCase();
        if (domain.includes(term)) {
          termScore += 30;
        }
      } catch {}
    }

    if (tab.groupName) {
      const groupLower = tab.groupName.toLowerCase();
      if (groupLower.includes(term)) {
        termScore += 40;
      }
    }

    if (tab._cachedContent) {
      const contentLower = tab._cachedContent.toLowerCase();
      if (contentLower.includes(term)) {
        termScore += 30;
      }
    }

    totalScore += termScore;
  }

  return totalScore;
}

function searchTabs(tabs: SearchableTab[], query: string): SearchableTab[] {
  if (!query || query.trim() === '') {
    return tabs;
  }
  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery.split(/\s+/);

  const scoredTabs = tabs.map((tab) => ({
    tab,
    score: scoreTab(tab, queryTerms),
  }));

  return scoredTabs
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => ({ ...item.tab, _searchScore: item.score }));
}

async function loadContentForTabs(tabs: SearchableTab[]): Promise<SearchableTab[]> {
  const tabsWithContent: SearchableTab[] = [];
  for (const tab of tabs) {
    const cachedContent = await Storage.getCachedContent(tab.id);
    tabsWithContent.push({
      ...tab,
      _cachedContent: cachedContent || '',
    });
  }
  return tabsWithContent;
}

async function extractAndCacheContent(tabId: number): Promise<string | null> {
  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'getContent',
      tabId,
    })) as { success?: boolean; content?: string };
    if (response.success && response.content) {
      await Storage.setContentCache(tabId, response.content);
      return response.content;
    }
  } catch (e) {
    console.error('Failed to extract content:', e);
  }
  return null;
}

async function searchWithContent(tabs: SearchableTab[], query: string): Promise<SearchableTab[]> {
  if (!query || query.trim() === '') {
    return tabs;
  }
  const basicResults = searchTabs(tabs, query);
  if (basicResults.length >= 3) {
    return basicResults;
  }
  const tabsWithContent = await loadContentForTabs(tabs);
  return searchTabs(tabsWithContent, query);
}

export const Search = {
  searchTabs,
  scoreTab,
  searchWithContent,
  loadContentForTabs,
  extractAndCacheContent,
  highlightMatches,
  escapeRegex,
};

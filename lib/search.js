// Search utility for full-text tab search with scoring

const Search = {
  // Search tabs by query, returning scored and sorted results
  searchTabs(tabs, query) {
    if (!query || query.trim() === '') {
      return tabs;
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/);

    const scoredTabs = tabs.map(tab => {
      const score = this.scoreTab(tab, queryTerms);
      return { tab, score };
    });

    // Filter out non-matching tabs and sort by score
    return scoredTabs
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => ({ ...item.tab, _searchScore: item.score }));
  },

  // Calculate search score for a tab
  scoreTab(tab, queryTerms) {
    let totalScore = 0;

    for (const term of queryTerms) {
      let termScore = 0;

      // Title match (highest priority)
      if (tab.title) {
        const titleLower = tab.title.toLowerCase();
        if (titleLower === term) {
          termScore += 150; // Exact match
        } else if (titleLower.includes(term)) {
          termScore += 100; // Partial match
        }
      }

      // URL match
      if (tab.url) {
        const urlLower = tab.url.toLowerCase();
        if (urlLower.includes(term)) {
          termScore += 50;
        }

        // Domain match bonus
        try {
          const domain = new URL(tab.url).hostname.toLowerCase();
          if (domain.includes(term)) {
            termScore += 30;
          }
        } catch (e) {}
      }

      // Group name match
      if (tab.groupName) {
        const groupLower = tab.groupName.toLowerCase();
        if (groupLower.includes(term)) {
          termScore += 40;
        }
      }

      // Content match (if available via cache)
      if (tab._cachedContent) {
        const contentLower = tab._cachedContent.toLowerCase();
        if (contentLower.includes(term)) {
          termScore += 30;
        }
      }

      totalScore += termScore;
    }

    return totalScore;
  },

  // Search with content extraction (async)
  async searchWithContent(tabs, query) {
    if (!query || query.trim() === '') {
      return tabs;
    }

    // First, try basic search
    const basicResults = this.searchTabs(tabs, query);

    // If we have good results from title/URL, return them
    if (basicResults.length >= 3) {
      return basicResults;
    }

    // Otherwise, try content search
    const tabsWithContent = await this.loadContentForTabs(tabs);
    return this.searchTabs(tabsWithContent, query);
  },

  // Load cached content for tabs
  async loadContentForTabs(tabs) {
    const tabsWithContent = [];

    for (const tab of tabs) {
      const cachedContent = await Storage.getCachedContent(tab.id);
      tabsWithContent.push({
        ...tab,
        _cachedContent: cachedContent || ''
      });
    }

    return tabsWithContent;
  },

  // Extract and cache content for a tab
  async extractAndCacheContent(tabId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getContent',
        tabId
      });

      if (response.success && response.content) {
        await Storage.setContentCache(tabId, response.content);
        return response.content;
      }
    } catch (e) {
      console.error('Failed to extract content:', e);
    }

    return null;
  },

  // Highlight matching text in results
  highlightMatches(text, query) {
    if (!query || !text) return text;

    const terms = query.toLowerCase().split(/\s+/);
    let highlighted = text;

    for (const term of terms) {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    }

    return highlighted;
  },

  // Escape special regex characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};

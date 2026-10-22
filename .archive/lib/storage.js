// Storage utility for chrome.storage wrapper

const Storage = {
  // Settings (stored in sync for cross-device access)
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      return result.settings || { apiKey: '', darkMode: false };
    } catch (e) {
      console.error('Failed to get settings:', e);
      return { apiKey: '', darkMode: false };
    }
  },

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set({ settings });
      return true;
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  },

  // Sessions (stored locally due to size)
  async getSessions() {
    try {
      const result = await chrome.storage.local.get(['sessions']);
      return result.sessions || [];
    } catch (e) {
      console.error('Failed to get sessions:', e);
      return [];
    }
  },

  async saveSessions(sessions) {
    try {
      await chrome.storage.local.set({ sessions });
      return true;
    } catch (e) {
      console.error('Failed to save sessions:', e);
      return false;
    }
  },

  // Content cache (stored locally, with TTL)
  async getContentCache() {
    try {
      const result = await chrome.storage.local.get(['contentCache']);
      return result.contentCache || {};
    } catch (e) {
      console.error('Failed to get content cache:', e);
      return {};
    }
  },

  async setContentCache(tabId, content) {
    try {
      const cache = await this.getContentCache();
      cache[tabId] = {
        content,
        cachedAt: Date.now()
      };
      await chrome.storage.local.set({ contentCache: cache });
      return true;
    } catch (e) {
      console.error('Failed to set content cache:', e);
      return false;
    }
  },

  async getCachedContent(tabId) {
    const cache = await this.getContentCache();
    const entry = cache[tabId];

    if (!entry) return null;

    // Check TTL (1 hour)
    const TTL = 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > TTL) {
      return null;
    }

    return entry.content;
  },

  // Clear expired cache entries
  async cleanupCache() {
    const cache = await this.getContentCache();
    const TTL = 60 * 60 * 1000;
    const now = Date.now();

    const cleaned = {};
    for (const [tabId, entry] of Object.entries(cache)) {
      if (now - entry.cachedAt <= TTL) {
        cleaned[tabId] = entry;
      }
    }

    await chrome.storage.local.set({ contentCache: cleaned });
  }
};

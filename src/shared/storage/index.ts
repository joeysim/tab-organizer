import type { Collection, Settings, ContentCache } from '../types/index.js';
import { STORAGE_KEYS, CONTENT_TTL } from '../constants/index.js';
import { getLegacyCollections } from './migration.js';

export const Storage = {
  async getSettings(): Promise<Settings> {
    try {
      const [syncResult, localResult] = await Promise.all([
        chrome.storage.sync.get([STORAGE_KEYS.settings]),
        chrome.storage.local.get([STORAGE_KEYS.settings]),
      ]);
      const syncVal = (syncResult as Record<string, unknown>)[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
      const localVal = (localResult as Record<string, unknown>)[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
      // apiKey lives in local (not synced), darkMode in sync; support legacy where both were in sync
      const apiKey = localVal?.apiKey ?? syncVal?.apiKey ?? '';
      const darkMode = syncVal?.darkMode ?? localVal?.darkMode ?? false;
      const hasExplicitThemePreference = syncVal?.hasExplicitThemePreference ?? localVal?.hasExplicitThemePreference ?? false;
      const showAppWindows = syncVal?.showAppWindows ?? localVal?.showAppWindows ?? false;
      if (syncVal?.apiKey && !localVal?.apiKey) {
        try { await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { apiKey } }); await chrome.storage.sync.set({ [STORAGE_KEYS.settings]: { darkMode, hasExplicitThemePreference, showAppWindows } }); } catch {}
      }
      return { apiKey, darkMode, hasExplicitThemePreference, showAppWindows };
    } catch {
      return { apiKey: '', darkMode: false };
    }
  },

  async saveSettings(settings: Settings): Promise<boolean> {
    try {
      await Promise.all([
        chrome.storage.local.set({ [STORAGE_KEYS.settings]: { apiKey: settings.apiKey } }),
        chrome.storage.sync.set({ [STORAGE_KEYS.settings]: { darkMode: settings.darkMode, hasExplicitThemePreference: settings.hasExplicitThemePreference, showAppWindows: settings.showAppWindows } }),
      ]);
      return true;
    } catch {
      return false;
    }
  },

  async getCollections(): Promise<Collection[]> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.collections]);
      if (STORAGE_KEYS.collections in result) {
        const collections = (result as Record<string, unknown>)[STORAGE_KEYS.collections] as Collection[] | undefined;
        if (Array.isArray(collections)) return collections; // empty array means user deleted all — don't fallback
      }
      // legacy shim: migrate once if collections key missing
      const legacy = await getLegacyCollections();
      if (legacy.length > 0) {
        try { await chrome.storage.local.set({ [STORAGE_KEYS.collections]: legacy }); await chrome.storage.local.remove([STORAGE_KEYS.legacySessions]); } catch {}
      }
      return legacy;
    } catch {
      return [];
    }
  },

  async saveCollections(collections: Collection[]): Promise<boolean> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.collections]: collections });
      return true;
    } catch {
      return false;
    }
  },

  async getCollection(id: string): Promise<Collection | undefined> {
    const collections = await this.getCollections();
    return collections.find((c) => c.id === id);
  },

  async getContentCache(): Promise<ContentCache> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.contentCache]);
      const cache = ((result as Record<string, unknown>)[STORAGE_KEYS.contentCache] as ContentCache) ?? {};
      // lazy purge expired entries on read if alarms not yet fired
      const now = Date.now();
      let purged = false;
      for (const [k, v] of Object.entries(cache)) {
        if (now - (v as { cachedAt: number }).cachedAt > CONTENT_TTL) { delete cache[k]; purged = true; }
      }
      if (purged) { try { await chrome.storage.local.set({ [STORAGE_KEYS.contentCache]: cache }); } catch {} }
      return cache;
    } catch {
      return {};
    }
  },

  async setContentCache(tabId: string | number, content: string): Promise<boolean> {
    try {
      const cache = await this.getContentCache();
      cache[String(tabId)] = { content, cachedAt: Date.now() };
      await chrome.storage.local.set({ [STORAGE_KEYS.contentCache]: cache });
      return true;
    } catch {
      return false;
    }
  },

  async getCachedContent(tabId: string | number): Promise<string | null> {
    const cache = await this.getContentCache();
    const key = String(tabId);
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CONTENT_TTL) {
      // lazy purge: remove expired entry so cache doesn't bloat if alarms unavailable
      try { delete cache[key]; await chrome.storage.local.set({ [STORAGE_KEYS.contentCache]: cache }); } catch {}
      return null;
    }
    return entry.content;
  },

  async cleanupCache(): Promise<void> {
    const cache = await this.getContentCache();
    const now = Date.now();
    const cleaned: ContentCache = {};
    for (const [tabId, entry] of Object.entries(cache)) {
      if (now - (entry as unknown as { cachedAt: number }).cachedAt <= CONTENT_TTL) {
        cleaned[tabId] = entry as unknown as ContentCache[keyof ContentCache];
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.contentCache]: cleaned });
  },

  // legacy aliases — preserved until Task 6 cutover removes lib/storage.js
  async getSessions(): Promise<Collection[]> {
    return this.getCollections();
  },

  async saveSessions(sessions: Collection[]): Promise<boolean> {
    return this.saveCollections(sessions);
  },
};

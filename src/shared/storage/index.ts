import type { Collection, Settings, ContentCache } from '../types/index.js';
import { STORAGE_KEYS, CONTENT_TTL } from '../constants/index.js';
import { getLegacyCollections } from './migration.js';

export const Storage = {
  async getSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.sync.get([STORAGE_KEYS.settings]);
      const val = (result as Record<string, unknown>)[STORAGE_KEYS.settings] as Settings | undefined;
      return val ?? { apiKey: '', darkMode: false };
    } catch {
      return { apiKey: '', darkMode: false };
    }
  },

  async saveSettings(settings: Settings): Promise<boolean> {
    try {
      await chrome.storage.sync.set({ [STORAGE_KEYS.settings]: settings });
      return true;
    } catch {
      return false;
    }
  },

  async getCollections(): Promise<Collection[]> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.collections]);
      const collections = (result as Record<string, unknown>)[STORAGE_KEYS.collections] as
        | Collection[]
        | undefined;
      if (Array.isArray(collections) && collections.length > 0) return collections;
      // legacy shim: read local.sessions when local.collections empty
      return await getLegacyCollections();
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
      if (now - entry.cachedAt <= CONTENT_TTL) {
        cleaned[tabId] = entry;
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

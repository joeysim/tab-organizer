import type { Collection } from '../types/index.js';
import { STORAGE_KEYS } from '../constants/index.js';

type LegacySession = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  createdAt?: number;
  tabs?: { url: string; title: string }[];
};

function mapLegacySession(s: LegacySession): Collection {
  return {
    id: s.id,
    name: s.name ?? s.title ?? '',
    description: s.description ?? '',
    createdAt: s.createdAt ?? Date.now(),
    tabs: (s.tabs ?? []).map((t) => ({ url: t.url, title: t.title })),
  };
}

export async function getLegacyCollections(): Promise<Collection[]> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.legacySessions]);
    const sessions = (result as Record<string, unknown>)[STORAGE_KEYS.legacySessions] as
      | LegacySession[]
      | undefined;
    if (!Array.isArray(sessions) || sessions.length === 0) return [];
    return sessions.map(mapLegacySession);
  } catch {
    return [];
  }
}

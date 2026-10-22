export type Tab = {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  groupId: number;
  groupName: string | null;
  groupColor: string | null;
  windowId: number;
  index: number;
  active: boolean;
  pinned: boolean;
};

export type TabGroup = {
  id: number;
  title: string;
  color: string;
  collapsed: boolean;
  tabs: { id: number; url: string; title: string; favIconUrl?: string }[];
};

export type Collection = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  tabs: { url: string; title: string }[];
};

export type Settings = {
  apiKey: string;
  darkMode: boolean;
  hasExplicitThemePreference?: boolean;
};

export type ContentCacheEntry = {
  content: string;
  cachedAt: number;
};

export type ContentCache = Record<string, ContentCacheEntry>;

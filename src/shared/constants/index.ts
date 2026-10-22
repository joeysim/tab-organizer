export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export const CHROME_COLORS = GROUP_COLORS;

export const STORAGE_KEYS = {
  settings: 'settings',
  collections: 'collections',
  contentCache: 'contentCache',
  legacySessions: 'sessions',
} as const;

export const BATCH_SIZE = 5;

export const CONTENT_TTL = 3600000;

export const CONTENT_LIMIT = 50000;

export const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'brave://',
  'file://',
] as const;

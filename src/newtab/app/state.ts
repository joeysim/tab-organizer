// state.ts — app state and color helpers
// Preserved from newtab/newtab.js: GROUP_COLORS, getNextColor/getRandomColor, state shape
import type { Collection, Settings, Tab, TabGroup } from '../../shared/types/index.js';

export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

let colorIndex = 0;

export function getNextColor(): string {
  const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
  colorIndex++;
  return color;
}

export function getRandomColor(): string {
  const shuffled = [...GROUP_COLORS].sort(() => Math.random() - 0.5);
  return shuffled[0];
}

// test helper to reset rotation deterministically
export function resetColorIndex(): void {
  colorIndex = 0;
}

export type AppState = {
  tabs: Tab[];
  groups: TabGroup[];
  collections: Collection[];
  selectedTabs: Set<number>;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  loading: boolean;
  currentCollection: Collection | null;
  activeGroupFilter: number | 'pinned' | null;
  settings: Settings;
};

export const state: AppState = {
  tabs: [],
  groups: [],
  collections: [],
  selectedTabs: new Set(),
  searchQuery: '',
  viewMode: 'grid',
  loading: true,
  currentCollection: null,
  activeGroupFilter: null,
  settings: { apiKey: '', darkMode: false },
};

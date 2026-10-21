// search.ts — handleSearch + 300ms debounce preserved from newtab.js
import { Search } from '../../lib/search/index.js';
import type { SearchableTab } from '../../lib/search/index.js';

// Pure filter used by tests — empty returns all, non-empty delegates to Search.searchTabs
export function filterTabsBySearch<T extends SearchableTab>(tabs: T[], query: string): T[] {
  if (!query || query.trim() === '') return tabs;
  return Search.searchTabs(tabs, query) as T[];
}

// Debounced handler factory — preserves 300ms debounce from original code
export function createSearchHandler(callback: (query: string) => void, delay = 300): (query: string) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (query: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(query), delay);
  };
}

// DOM wiring — called from main.ts to bind input element
export function setupSearchInput(onSearch: (query: string) => void): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  if (!searchInput) return;
  const handler = createSearchHandler(onSearch, 300);
  searchInput.addEventListener('input', (e) => handler((e.target as HTMLInputElement).value));
}

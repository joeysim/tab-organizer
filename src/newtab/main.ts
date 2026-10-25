/**
 * main.ts — ESM bootstrap for newtab
 * Phase 1: keep globals via window.Storage shim for backward compat; document transition.
 * Phase 2: pure imports (no window.*) — handled after Task 6 cutover removes legacy lib/*.js.
 *
 * Preserves original DOMContentLoaded flow: loadSettings→loadTabs→loadCollections→setupEventListeners→setupLiveUpdates→setupGlobalDragHandler→setupKeyboardNavigation+detectSystemTheme
 */
import { state } from './app/state.js';
import { loadSettings, loadTabs, renderApp } from './app/render.js';
import { loadCollections } from './app/collections.js';
import { setupGlobalDragHandler } from './app/dnd.js';
import { setupKeyboardNavigation } from './app/keyboard.js';
import { setupSearchInput } from './app/search.js';
import { setupModalListeners, showGroupModal, showCollectionModal, showSettingsModal } from './app/modals.js';
import { showToast } from './app/toast.js';

// Phase 1 shim: expose Storage/Search/etc. on window for legacy scripts still present
declare global {
  interface Window {
    Storage?: unknown;
    Search?: unknown;
    CollectionManager?: unknown;
    AI?: unknown;
  }
}

function setupEventListeners(): void {
  // Search with preserved 300ms debounce
  setupSearchInput((query) => {
    state.searchQuery = query;
    renderApp();
  });

  document.getElementById('viewToggle')?.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    renderApp();
  });

  document.getElementById('selectAllBtn')?.addEventListener('click', async () => {
    const { selectAllTabs } = await import('./app/tabs.js');
    selectAllTabs();
  });
  document.getElementById('deselectAllBtn')?.addEventListener('click', async () => {
    const { deselectAllTabs } = await import('./app/tabs.js');
    deselectAllTabs();
  });

  document.getElementById('groupSelectedBtn')?.addEventListener('click', () => {
    if (state.selectedTabs.size > 0) showGroupModal();
  });
  document.getElementById('collectionSelectedBtn')?.addEventListener('click', () => {
    if (state.selectedTabs.size > 0) showCollectionModal();
  });
  document.getElementById('closeSelectedBtn')?.addEventListener('click', async () => {
    const { closeSelectedTabs } = await import('./app/tabs.js');
    await closeSelectedTabs();
  });
  document.getElementById('addToCollectionBtn')?.addEventListener('click', async () => {
    if (state.selectedTabs.size > 0) {
      const { showAddToCollectionModal } = await import('./app/collections.js');
      await showAddToCollectionModal();
    }
  });

  document.getElementById('createGroupBtn')?.addEventListener('click', () => {
    if (state.selectedTabs.size > 0) showGroupModal();
    else showToast('Select tabs first', 'error');
  });
  document.getElementById('saveCollectionBtn')?.addEventListener('click', () => {
    if (state.selectedTabs.size > 0) showCollectionModal();
    else showToast('Select tabs first', 'error');
  });
  document.getElementById('viewAllCollectionsBtn')?.addEventListener('click', async () => {
    const { viewAllCollections } = await import('./app/collections.js');
    await viewAllCollections();
  });

  document.getElementById('settingsBtn')?.addEventListener('click', () => showSettingsModal());
  document.getElementById('aiOrganizeBtn')?.addEventListener('click', async () => {
    if (!state.settings.apiKey) {
      showSettingsModal();
      return;
    }
    const { handleAIOrganize } = await import('./app/collections.js');
    await handleAIOrganize();
  });

  // The Lab: bottom-center button, recipes, proposals, free-form
  document.getElementById('lab')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { toggleLab } = await import('./app/lab.js');
    toggleLab();
  });
  document.getElementById('labmenu')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.lab-ask')) return; // composer handles its own submit
    const row = target.closest('.lab-row') as HTMLElement | null;
    if (!row) return;
    const { runPrompt } = await import('./app/lab.js');
    if (row.classList.contains('lab-guide')) {
      const { setCard } = await import('./app/lab.js');
      setCard('The Lab', 'ready', 'Recipes and suggestions run a plan you approve first. Nothing changes on its own.');
      window.setTimeout(() => void import('./app/lab.js').then((m) => m.clearCard()), 4000);
      return;
    }
    await runPrompt(row.dataset.prompt || '', row.dataset.group === '1');
  });
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#labmenu') || target.closest('#lab')) return;
    const { labIsOpen, closeLab } = await import('./app/lab.js');
    if (labIsOpen()) closeLab();
  });

  document.getElementById('approvePlanBtn')?.addEventListener('click', async () => {
    const { approvePlan } = await import('./app/ai.js');
    await approvePlan();
  });
  document.getElementById('cancelPlanBtn')?.addEventListener('click', async () => {
    const { closePlanModal } = await import('./app/ai.js');
    closePlanModal();
  });
  document.getElementById('closeAiActionModal')?.addEventListener('click', async () => {
    const { closePlanModal } = await import('./app/ai.js');
    closePlanModal();
  });
  document.getElementById('undoBtn')?.addEventListener('click', async () => {
    const { undoPlan } = await import('./app/ai.js');
    await undoPlan();
  });
  document.getElementById('dismissUndoBtn')?.addEventListener('click', async () => {
    const { hideUndoBar } = await import('./app/ai.js');
    hideUndoBar();
  });

  setupModalListeners();
}

function setupLiveUpdates(): void {
  let updateTimeout: ReturnType<typeof setTimeout> | undefined;
  const debouncedLoadTabs = () => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => loadTabs(false), 100);
  };

  try {
    chrome.tabs.onCreated.addListener(debouncedLoadTabs);
    chrome.tabs.onRemoved.addListener(debouncedLoadTabs);
    chrome.tabs.onUpdated.addListener((_tabId: number, changeInfo: { title?: string; url?: string; favIconUrl?: string }) => {
      if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) debouncedLoadTabs();
    });

    // @ts-ignore — chrome.tabGroups may be undefined in some contexts
    if (chrome.tabGroups) {
      // @ts-ignore
      chrome.tabGroups.onCreated?.addListener(debouncedLoadTabs);
      // @ts-ignore
      chrome.tabGroups.onUpdated?.addListener(debouncedLoadTabs);
      // @ts-ignore
      chrome.tabGroups.onRemoved?.addListener(debouncedLoadTabs);
    }
  } catch {}
}

function detectSystemTheme(): void {
  if (state.hasExplicitThemePreference) return;
  try {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (state.hasExplicitThemePreference) return;
      if (e.matches) document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    });
  } catch {}
}

let initialized = false;
async function initApp(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    await loadSettings();
    await loadTabs();
    await loadCollections();
    setupEventListeners();
    setupLiveUpdates();
    setupGlobalDragHandler();
    setupKeyboardNavigation();
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const { toggleLab } = await import('./app/lab.js');
      toggleLab();
    }
  });
    detectSystemTheme();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.textContent = '';
      const p = document.createElement('p');
      p.style.color = 'var(--danger-color)';
      p.textContent = `Failed to load: ${(error as Error).message}`;
      const btn = document.createElement('button');
      btn.textContent = 'Retry';
      btn.className = 'btn btn-primary';
      (btn as HTMLElement).style.marginTop = '16px';
      btn.addEventListener('click', () => location.reload());
      loading.append(p, btn);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { void initApp(); });
if (document.readyState !== 'loading') {
  void initApp();
}
// Debug marker for headless checks
(window as unknown as Record<string, unknown>).__tabOrganizerInit = initApp;

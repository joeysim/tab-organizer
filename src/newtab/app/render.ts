// render.ts — renderApp/renderTabCount/renderGroups/createTabCard/renderTabs preserved from newtab.js
import { state } from './state.js';
import { showToast } from './toast.js';
import { filterTabsBySearch } from './search.js';
import { dragState } from './dnd.js';
import { showGroupColorPicker, applyGroupFilter } from './groups.js';

// Loaders (used by main.ts and groups.ts)
export async function loadTabs(showLoading = true): Promise<void> {
  if (showLoading && state.tabs.length === 0) {
    state.loading = true;
    renderLoading();
  }
  try {
    const response = (await chrome.runtime.sendMessage({ action: 'getTabs' })) as { success?: boolean; tabs?: typeof state.tabs };
    if (response.success && response.tabs) state.tabs = response.tabs;
    const groupResponse = (await chrome.runtime.sendMessage({ action: 'getGroups' })) as {
      success?: boolean;
      groups?: typeof state.groups;
    };
    if (groupResponse.success && groupResponse.groups) state.groups = groupResponse.groups;
  } catch (error) {
    console.error('Failed to load tabs:', error);
  }
  state.loading = false;
  renderApp();
}

export async function loadSettings(): Promise<void> {
  try {
    // Phase 1: support window.Storage shim; Phase 2: ESM import
    const StorageMod = await import('../../shared/storage/index.js').catch(() => null);
    const Storage = (StorageMod?.Storage as unknown as { getSettings: () => Promise<typeof state.settings> }) ||
      (window as unknown as { Storage?: { getSettings: () => Promise<typeof state.settings> } }).Storage;
    if (!Storage) return;
    const stored = await Storage.getSettings();
    if (stored) {
      state.settings = stored;
      // Detect explicit preference: check raw storage, not default fallback
      try {
        const raw = await chrome.storage.sync.get(['settings']) as Record<string, unknown>;
        const rawSettings = (raw as { settings?: { darkMode?: boolean } }).settings;
        state.hasExplicitThemePreference = rawSettings?.darkMode !== undefined;
      } catch {
        state.hasExplicitThemePreference = stored.darkMode !== undefined;
      }
      if (state.settings.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
      const aiBtn = document.getElementById('aiOrganizeBtn') as HTMLButtonElement | null;
      if (aiBtn) aiBtn.disabled = !state.settings.apiKey;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

export function renderApp(): void {
  renderTabCount();
  renderGroups();
  renderTabs();
  if (state.activeGroupFilter !== null) applyGroupFilter();
}

export function renderTabCount(): void {
  const count = state.tabs.length;
  const pluralSuffix = count !== 1 ? 's' : '';
  const el = document.getElementById('tabCount');
  if (el) el.textContent = `${count} tab${pluralSuffix}`;
}

export function renderGroups(): void {
  const groupList = document.getElementById('groupList');
  if (!groupList) return;
  groupList.innerHTML = '';

  const allEl = document.createElement('div');
  allEl.className = 'group-item' + (state.activeGroupFilter === null ? ' active' : '');
  allEl.innerHTML = `
    <span class="group-dot" style="background: var(--text-muted);"></span>
    <span class="group-name">All Tabs</span>
    <span class="group-count">${state.tabs.length}</span>
  `;
  allEl.addEventListener('click', () => {
    state.activeGroupFilter = null;
    applyGroupFilter();
  });
  groupList.appendChild(allEl);

  const pinnedTabs = state.tabs.filter((t) => t.pinned);
  if (pinnedTabs.length > 0) {
    const pinnedEl = document.createElement('div');
    pinnedEl.className = 'group-item' + (state.activeGroupFilter === 'pinned' ? ' active' : '');
    pinnedEl.dataset.groupId = 'pinned';
    pinnedEl.innerHTML = `
      <span class="group-icon pin-icon">&#128204;</span>
      <span class="group-name">Pinned</span>
      <span class="group-count">${pinnedTabs.length}</span>
    `;
    pinnedEl.addEventListener('click', () => {
      state.activeGroupFilter = 'pinned';
      applyGroupFilter();
    });
    groupList.appendChild(pinnedEl);
  }

  state.groups.forEach((group) => {
    if (group.id === -1) return;
    const groupEl = document.createElement('div');
    groupEl.className = 'group-item' + (state.activeGroupFilter === group.id ? ' active' : '');
    groupEl.dataset.groupId = String(group.id);

    const colorDot = document.createElement('button');
    colorDot.className = 'group-color-btn';
    colorDot.style.background = `var(--group-${group.color || 'grey'})`;
    colorDot.title = 'Change color';
    colorDot.addEventListener('click', (e) => {
      e.stopPropagation();
      showGroupColorPicker(groupEl, group as unknown as { id: number; color?: string });
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = group.title || 'Untitled';

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = String(group.tabs.length);

    groupEl.appendChild(colorDot);
    groupEl.appendChild(nameSpan);
    groupEl.appendChild(countSpan);

    groupEl.addEventListener('click', () => {
      state.activeGroupFilter = group.id;
      applyGroupFilter();
    });

    groupEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'copy';
    });

    groupEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      groupEl.classList.remove('drag-over');
      try {
        const tabIds: number[] = JSON.parse((e as DragEvent).dataTransfer!.getData('text/plain'));
        if (tabIds.length > 0) {
          await chrome.runtime.sendMessage({ action: 'addTabsToGroup', groupId: group.id, tabIds });
          showToast(`Added ${tabIds.length} tab${tabIds.length > 1 ? 's' : ''} to "${group.title || 'group'}"`, 'success');
          await loadTabs();
        }
      } catch (error) {
        console.error('Drop error:', error);
      }
    });

    groupList.appendChild(groupEl);
  });

  const ungrouped = state.groups.find((g) => g.id === -1);
  if (ungrouped && ungrouped.tabs.length > 0) {
    const ungroupedEl = document.createElement('div');
    ungroupedEl.className = 'group-item' + (state.activeGroupFilter === -1 ? ' active' : '');
    ungroupedEl.dataset.groupId = '-1';
    ungroupedEl.innerHTML = `
      <span class="group-dot" style="background: var(--text-muted); border: 1px dashed var(--border-color);"></span>
      <span class="group-name">Ungrouped</span>
      <span class="group-count">${ungrouped.tabs.length}</span>
    `;
    ungroupedEl.addEventListener('click', () => {
      state.activeGroupFilter = -1;
      applyGroupFilter();
    });
    groupList.appendChild(ungroupedEl);
  }
}

export function renderTabs(): void {
  const tabGrid = document.getElementById('tabGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('loading');
  if (!tabGrid || !emptyState || !loading) return;

  loading.style.display = 'none';

  let filteredTabs = state.tabs;
  if (state.searchQuery) filteredTabs = filterTabsBySearch(state.tabs, state.searchQuery) as typeof state.tabs;

  if (filteredTabs.length === 0) {
    tabGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tabGrid.innerHTML = '';
  tabGrid.className = state.viewMode === 'list' ? 'tab-grid list-view' : 'tab-grid';

  filteredTabs.forEach((tab) => {
    const tabCard = createTabCard(tab);
    tabGrid.appendChild(tabCard);
  });

  // update selection bar (inline to avoid circular import with tabs.ts)
  {
    const selectionInfo = document.getElementById('selectionInfo');
    const selectedCount = document.getElementById('selectedCount');
    if (selectionInfo && selectedCount) {
      if (state.selectedTabs.size > 0) {
        selectionInfo.style.display = 'flex';
        selectedCount.textContent = `${state.selectedTabs.size} selected`;
      } else {
        selectionInfo.style.display = 'none';
      }
    }
  }
}

export function renderLoading(): void {
  const loading = document.getElementById('loading');
  const tabGrid = document.getElementById('tabGrid');
  const emptyState = document.getElementById('emptyState');
  if (loading) loading.style.display = 'flex';
  if (tabGrid) tabGrid.innerHTML = '';
  if (emptyState) emptyState.style.display = 'none';
}

function cardToggleTabSelection(tabId: number): void {
  if (state.selectedTabs.has(tabId)) state.selectedTabs.delete(tabId);
  else state.selectedTabs.add(tabId);
  const card = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (card) {
    card.classList.toggle('selected', state.selectedTabs.has(tabId));
    const cb = card.querySelector('.tab-checkbox') as HTMLInputElement | null;
    if (cb) cb.checked = state.selectedTabs.has(tabId);
  }
  const selectionInfo = document.getElementById('selectionInfo');
  const selectedCount = document.getElementById('selectedCount');
  if (selectionInfo && selectedCount) {
    if (state.selectedTabs.size > 0) {
      selectionInfo.style.display = 'flex';
      selectedCount.textContent = `${state.selectedTabs.size} selected`;
    } else selectionInfo.style.display = 'none';
  }
}

async function cardActivateTab(tabId: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'activateTab', tabId });
}

async function cardCloseTab(tabId: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'closeTab', tabId });
  state.tabs = state.tabs.filter((t) => t.id !== tabId);
  state.selectedTabs.delete(tabId);
  renderApp();
}

export function createTabCard(tab: (typeof state.tabs)[number]): HTMLElement {
  // inline helpers to avoid circular import with tabs.ts — behavior preserved

  const card = document.createElement('div');
  card.className = 'tab-card';
  card.dataset.tabId = String(tab.id);
  card.draggable = true;

  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    const rect = card.getBoundingClientRect();
    dragState.element = card;
    dragState.offsetX = (e as DragEvent).clientX - rect.left;
    dragState.offsetY = (e as DragEvent).clientY - rect.top;
    dragState.width = rect.width;
    dragState.height = rect.height;

    if (state.selectedTabs.has(tab.id)) {
      (e as DragEvent).dataTransfer!.setData('text/plain', JSON.stringify(Array.from(state.selectedTabs)));
    } else {
      (e as DragEvent).dataTransfer!.setData('text/plain', JSON.stringify([tab.id]));
    }
    (e as DragEvent).dataTransfer!.effectAllowed = 'copy';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragState.element = null;
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });

  if (state.selectedTabs.has(tab.id)) card.classList.add('selected');
  if (tab.pinned) card.classList.add('pinned');

  if (tab.groupId && tab.groupId !== -1) {
    const groupIndicator = document.createElement('div');
    groupIndicator.className = 'tab-group-indicator';
    groupIndicator.style.background = `var(--group-${tab.groupColor || 'grey'})`;
    card.appendChild(groupIndicator);
  }

  const header = document.createElement('div');
  header.className = 'tab-card-header';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tab-checkbox';
  checkbox.checked = state.selectedTabs.has(tab.id);
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    cardToggleTabSelection(tab.id);
  });

  const faviconContainer = document.createElement('div');
  if (tab.favIconUrl) {
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl;
    favicon.onerror = () => {
      favicon.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.className = 'tab-favicon-placeholder';
      placeholder.textContent = '📄';
      faviconContainer.appendChild(placeholder);
    };
    faviconContainer.appendChild(favicon);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'tab-favicon-placeholder';
    placeholder.textContent = '📄';
    faviconContainer.appendChild(placeholder);
  }

  const info = document.createElement('div');
  info.className = 'tab-info';
  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || 'Untitled';
  const url = document.createElement('div');
  url.className = 'tab-url';
  try {
    const urlObj = new URL(tab.url);
    url.textContent = urlObj.hostname || tab.url;
  } catch {
    url.textContent = tab.url || 'No URL';
  }
  info.appendChild(title);
  info.appendChild(url);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cardCloseTab(tab.id);
  });

  header.appendChild(checkbox);
  header.appendChild(faviconContainer);
  if (tab.pinned) {
    const pinIcon = document.createElement('span');
    pinIcon.className = 'tab-pin-icon';
    pinIcon.innerHTML = '&#128204;';
    pinIcon.title = 'Pinned tab';
    header.appendChild(pinIcon);
  }
  header.appendChild(info);
  header.appendChild(closeBtn);

  card.appendChild(header);

  card.addEventListener('click', (e) => {
    if (e.target === card || (e.target as HTMLElement).closest('.tab-info')) {
      cardActivateTab(tab.id);
    }
  });

  return card;
}

export async function createGroup(name: string, color: string): Promise<void> {
  if (state.selectedTabs.size === 0) return;
  const { getNextColor } = await import('./state.js');
  const groupColor = color || getNextColor();
  const tabIds = Array.from(state.selectedTabs);
  const response = (await chrome.runtime.sendMessage({ action: 'createGroup', name, color: groupColor, tabIds })) as {
    success?: boolean;
  };
  if (response.success) {
    state.selectedTabs.clear();
    await loadTabs();
  }
}

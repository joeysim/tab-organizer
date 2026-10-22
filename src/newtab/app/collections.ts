// collections.ts — collection flows preserved from newtab.js, reopen via background sendMessage
import { state } from './state.js';
import { CollectionManager } from '../../lib/collections/index.js';
import { showToast } from './toast.js';
import { showModal, hideModal } from './modals.js';

export async function loadCollections(): Promise<void> {
  const collections = await CollectionManager.getCollections();
  state.collections = collections;
  renderCollections();
}

export function renderCollections(): void {
  const collectionList = document.getElementById('collectionList');
  if (!collectionList) return;
  collectionList.innerHTML = '';

  if (state.collections.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'collection-empty';
    emptyEl.textContent = 'No collections yet';
    collectionList.appendChild(emptyEl);
    return;
  }

  state.collections.forEach((collection) => {
    const collectionEl = document.createElement('div');
    collectionEl.className = 'collection-item';
    collectionEl.dataset.collectionId = collection.id;

    const info = document.createElement('div');
    info.className = 'collection-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'collection-name';
    nameEl.textContent = collection.name;
    const countEl = document.createElement('div');
    countEl.className = 'collection-count';
    countEl.textContent = `${collection.tabs.length} links`;
    info.append(nameEl, countEl);
    collectionEl.appendChild(info);

    collectionEl.addEventListener('click', () => viewCollection(collection.id));

    collectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'copy';
    });

    collectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      collectionEl.classList.remove('drag-over');
      try {
        const tabIds: number[] = JSON.parse((e as DragEvent).dataTransfer!.getData('text/plain'));
        const tabsToAdd = state.tabs
          .filter((t) => tabIds.includes(t.id))
          .map((t) => ({ url: t.url, title: t.title }));
        if (tabsToAdd.length > 0) {
          await CollectionManager.addTabsToCollection(collection.id, tabsToAdd);
          await loadCollections();
          showToast(`Added ${tabsToAdd.length} tab${tabsToAdd.length > 1 ? 's' : ''} to "${collection.name}"`, 'success');
        }
      } catch (err) {
        console.error('Drop error:', err);
      }
    });

    collectionList.appendChild(collectionEl);
  });
}

export async function saveCollection(name: string, description: string): Promise<void> {
  if (state.selectedTabs.size === 0) {
    showToast('Please select tabs first', 'error');
    return;
  }
  const selectedTabData = state.tabs
    .filter((t) => state.selectedTabs.has(t.id))
    .map((t) => ({ url: t.url, title: t.title }));
  await CollectionManager.saveCollection(name, description, selectedTabData);
  await loadCollections();
  showToast(`Collection "${name}" saved with ${selectedTabData.length} links`, 'success');
}

export async function viewCollection(collectionId: string): Promise<void> {
  const collection = await CollectionManager.getCollection(collectionId);
  if (!collection) return;
  state.currentCollection = collection;

  const titleEl = document.getElementById('viewCollectionTitle');
  if (titleEl) titleEl.textContent = collection.name;
  const descEl = document.getElementById('viewCollectionDescription');
  if (descEl) descEl.textContent = collection.description || '';

  const tabsContainer = document.getElementById('viewCollectionTabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  collection.tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'collection-tab-item';
    const idx = document.createElement('span');
    idx.className = 'collection-tab-index';
    idx.textContent = `${index + 1}.`;
    const a = document.createElement('a');
    a.href = tab.url;
    a.target = '_blank';
    a.className = 'collection-tab-link';
    const title = document.createElement('span');
    title.className = 'collection-tab-title';
    title.textContent = tab.title;
    const url = document.createElement('span');
    url.className = 'collection-tab-url';
    url.textContent = tab.url;
    a.append(title, url);
    tabEl.append(idx, a);
    tabsContainer.appendChild(tabEl);
  });

  showModal('viewCollectionModal');
}

export async function deleteCurrentCollection(): Promise<void> {
  if (!state.currentCollection) return;
  await CollectionManager.deleteCollection(state.currentCollection.id);
  await loadCollections();
  hideModal();
  showToast('Collection deleted', 'success');
}

export async function reopenCurrentCollection(): Promise<void> {
  if (!state.currentCollection) return;
  // Task 5: delegate reopen to background (no privileged chrome.tabs.create from newtab)
  try {
    await chrome.runtime.sendMessage({ action: 'reopenCollection', collectionId: state.currentCollection.id });
  } catch {
    // fallback: keep CollectionManager local reopen if background unavailable (tests)
    const fallback = CollectionManager as unknown as { reopenCollection?: (id: string) => Promise<void> };
    if (fallback.reopenCollection) await fallback.reopenCollection(state.currentCollection.id);
  }
  hideModal();
  showToast(`Opened ${state.currentCollection.tabs.length} tabs`, 'success');
}

export async function copyCurrentCollection(): Promise<void> {
  if (!state.currentCollection) return;
  await CollectionManager.copyToClipboard(state.currentCollection);
  showToast('Copied to clipboard', 'success');
}

export function downloadCurrentCollection(): void {
  if (!state.currentCollection) return;
  CollectionManager.downloadAsMarkdown(state.currentCollection);
  showToast('Downloaded as Markdown', 'success');
}

export function showAddLinkForm(): void {
  const form = document.getElementById('addLinkForm');
  if (form) form.style.display = 'block';
  const urlEl = document.getElementById('addLinkUrl') as HTMLInputElement | null;
  const titleEl = document.getElementById('addLinkTitle') as HTMLInputElement | null;
  if (urlEl) { urlEl.value = ''; }
  if (titleEl) titleEl.value = '';
  urlEl?.focus();
}

export function hideAddLinkForm(): void {
  const form = document.getElementById('addLinkForm');
  if (form) form.style.display = 'none';
  const urlEl = document.getElementById('addLinkUrl') as HTMLInputElement | null;
  const titleEl = document.getElementById('addLinkTitle') as HTMLInputElement | null;
  if (urlEl) urlEl.value = '';
  if (titleEl) titleEl.value = '';
}

export async function addLinkToCurrentCollection(): Promise<void> {
  if (!state.currentCollection) return;
  const url = (document.getElementById('addLinkUrl') as HTMLInputElement)?.value.trim() || '';
  const title = (document.getElementById('addLinkTitle') as HTMLInputElement)?.value.trim() || '';
  if (!url) {
    showToast('Please enter a URL', 'error');
    return;
  }
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
  } catch {
    showToast('Please enter a valid URL', 'error');
    return;
  }
  try {
    const updated = await CollectionManager.addToCollection(state.currentCollection.id, { url, title: title || url });
    state.currentCollection = updated;
    hideAddLinkForm();
    const tabsContainer = document.getElementById('viewCollectionTabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      updated.tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'collection-tab-item';
        const idx = document.createElement('span');
        idx.className = 'collection-tab-index';
        idx.textContent = `${index + 1}.`;
        const a = document.createElement('a');
        a.href = tab.url;
        a.target = '_blank';
        a.className = 'collection-tab-link';
        const title = document.createElement('span');
        title.className = 'collection-tab-title';
        title.textContent = tab.title;
        const urlEl = document.createElement('span');
        urlEl.className = 'collection-tab-url';
        urlEl.textContent = tab.url;
        a.append(title, urlEl);
        tabEl.append(idx, a);
        tabsContainer.appendChild(tabEl);
      });
    }
    showToast('Link added to collection', 'success');
  } catch (error) {
    showToast('Failed to add link: ' + (error as Error).message, 'error');
  }
}

export async function viewAllCollections(): Promise<void> {
  const collections = await CollectionManager.getCollections();
  const container = document.getElementById('allCollectionsList');
  if (!container) return;
  container.innerHTML = '';

  if (collections.length === 0) {
    container.innerHTML = '<p class="collection-empty">No collections saved yet. Select tabs and save them as a collection.</p>';
    showModal('viewAllCollectionsModal');
    return;
  }

  collections.forEach((collection, idx) => {
    const collectionEl = document.createElement('div');
    collectionEl.className = 'all-collections-item';
    const header = document.createElement('div');
    header.className = 'all-collections-header';
    const num = document.createElement('span');
    num.className = 'all-collections-number';
    num.textContent = `${idx + 1}.`;
    const name = document.createElement('span');
    name.className = 'all-collections-name';
    name.textContent = collection.name;
    const count = document.createElement('span');
    count.className = 'all-collections-count';
    count.textContent = `${collection.tabs.length} links`;
    header.append(num, name, count);
    collectionEl.appendChild(header);
    if (collection.description) {
      const desc = document.createElement('p');
      desc.className = 'all-collections-desc';
      desc.textContent = collection.description;
      collectionEl.appendChild(desc);
    }
    const preview = document.createElement('div');
    preview.className = 'all-collections-preview';
    preview.textContent = collection.tabs.slice(0, 3).map((t) => t.title).join(', ') + (collection.tabs.length > 3 ? ` +${collection.tabs.length - 3} more` : '');
    collectionEl.appendChild(preview);
    const date = document.createElement('div');
    date.className = 'all-collections-date';
    date.textContent = `Created: ${new Date(collection.createdAt).toLocaleDateString()}`;
    collectionEl.appendChild(date);
    collectionEl.addEventListener('click', () => {
      hideModal();
      viewCollection(collection.id);
    });
    container.appendChild(collectionEl);
  });

  showModal('viewAllCollectionsModal');
}

export async function copyAllCollections(): Promise<void> {
  await CollectionManager.copyAllToClipboard();
  showToast('All collections copied to clipboard', 'success');
}

export async function downloadAllCollections(): Promise<void> {
  await CollectionManager.downloadAllAsMarkdown();
  showToast('All collections downloaded as Markdown', 'success');
}

export async function showAddToCollectionModal(): Promise<void> {
  const collections = await CollectionManager.getCollections();
  const container = document.getElementById('collectionSelectList');
  if (!container) return;
  container.innerHTML = '';
  const info = document.getElementById('addToCollectionInfo');
  if (info) info.textContent = `${state.selectedTabs.size} tabs selected`;

  if (collections.length === 0) {
    container.innerHTML = '<p class="collection-select-empty">No collections yet. Create a new collection first.</p>';
    showModal('addToCollectionModal');
    return;
  }

  collections.forEach((collection) => {
    const item = document.createElement('div');
    item.className = 'collection-select-item';
    const info = document.createElement('div');
    info.className = 'collection-select-info';
    const name = document.createElement('div');
    name.className = 'collection-select-name';
    name.textContent = collection.name;
    const cnt = document.createElement('div');
    cnt.className = 'collection-select-count';
    cnt.textContent = `${collection.tabs.length} links`;
    info.append(name, cnt);
    const btn = document.createElement('button');
    btn.className = 'btn btn-small btn-primary';
    btn.textContent = 'Add';
    item.append(info, btn);
    item.addEventListener('click', async () => {
      await addSelectedTabsToCollection(collection.id);
    });
    container.appendChild(item);
  });

  showModal('addToCollectionModal');
}

export async function addSelectedTabsToCollection(collectionId: string): Promise<void> {
  if (state.selectedTabs.size === 0) {
    showToast('No tabs selected', 'error');
    return;
  }
  const selectedTabData = state.tabs
    .filter((t) => state.selectedTabs.has(t.id))
    .map((t) => ({ url: t.url, title: t.title }));
  try {
    await CollectionManager.addTabsToCollection(collectionId, selectedTabData);
    await loadCollections();
    hideModal();
    showToast(`Added ${selectedTabData.length} tabs to collection`, 'success');
  } catch (error) {
    showToast('Failed to add tabs: ' + (error as Error).message, 'error');
  }
}

// AI preview state preserved from original
let aiSuggestions: { groups: Array<{ name: string; color: string; tabs: number[] }> } | null = null;

export async function handleAIOrganize(): Promise<void> {
  const tabs = state.tabs.map((t) => ({ id: t.id, title: t.title, url: t.url }));
  showModal('aiPreviewModal');
  const previewContent = document.getElementById('aiPreviewContent');
  if (previewContent) previewContent.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Analyzing tabs...</p></div>';
  try {
    const mod = await import('../../lib/ai/claude.js').catch(() => null as unknown as { AI: unknown });
    const AI = (mod as unknown as { AI?: { organizeTabs: (tabs: unknown[], key: string) => Promise<unknown> } })?.AI as unknown as { organizeTabs?: (tabs: unknown[], key: string) => Promise<unknown> } | null;
    // fallback to window.AI shim during Phase 1
    const ai = (AI as unknown as { organizeTabs?: (tabs: unknown[], key: string) => Promise<unknown> }) || (window as unknown as { AI?: { organizeTabs: (tabs: unknown[], key: string) => Promise<unknown> } }).AI;
    if (!ai?.organizeTabs) throw new Error('AI not available');
    aiSuggestions = (await ai.organizeTabs(tabs, state.settings.apiKey)) as typeof aiSuggestions;
    renderAIPreview(aiSuggestions!);
  } catch (error) {
    if (previewContent) { previewContent.textContent = ''; const p = document.createElement('p'); p.style.color = 'var(--danger-color)'; p.textContent = `Error: ${(error as Error).message}`; previewContent.appendChild(p); }
  }
}

export function renderAIPreview(suggestions: { groups: Array<{ name: string; color: string; tabs: number[] }> }): void {
  const previewContent = document.getElementById('aiPreviewContent');
  if (!previewContent) return;
  previewContent.innerHTML = '';
  suggestions.groups.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'ai-group-preview';
    const header = document.createElement('div');
    header.className = 'ai-group-header';
    const dot = document.createElement('span');
    dot.className = 'group-dot';
    (dot as HTMLElement).style.background = `var(--group-${group.color})`;
    const nm = document.createElement('span');
    nm.textContent = group.name;
    const gc = document.createElement('span');
    gc.className = 'group-count';
    gc.textContent = `${group.tabs.length} tabs`;
    header.append(dot, nm, gc);
    const tabsList = document.createElement('div');
    tabsList.className = 'ai-group-tabs';
    group.tabs.forEach((tabId) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (tab) {
        const tabEl = document.createElement('div');
        tabEl.className = 'ai-group-tab';
        tabEl.textContent = tab.title;
        tabsList.appendChild(tabEl);
      }
    });
    groupEl.appendChild(header);
    groupEl.appendChild(tabsList);
    previewContent.appendChild(groupEl);
  });
}

export async function applyAISuggestions(): Promise<void> {
  if (!aiSuggestions) return;
  for (const group of aiSuggestions.groups) {
    await chrome.runtime.sendMessage({ action: 'createGroup', name: group.name, color: group.color, tabIds: group.tabs });
  }
  aiSuggestions = null;
  const { loadTabs } = await import('./render.js');
  await loadTabs();
}

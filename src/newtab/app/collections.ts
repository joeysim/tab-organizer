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

    collectionEl.innerHTML = `
      <div class="collection-info">
        <div class="collection-name">${collection.name}</div>
        <div class="collection-count">${collection.tabs.length} links</div>
      </div>
    `;

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
    tabEl.innerHTML = `
      <span class="collection-tab-index">${index + 1}.</span>
      <a href="${tab.url}" target="_blank" class="collection-tab-link">
        <span class="collection-tab-title">${tab.title}</span>
        <span class="collection-tab-url">${tab.url}</span>
      </a>
    `;
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
    new URL(url);
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
        tabEl.innerHTML = `
          <span class="collection-tab-index">${index + 1}.</span>
          <a href="${tab.url}" target="_blank" class="collection-tab-link">
            <span class="collection-tab-title">${tab.title}</span>
            <span class="collection-tab-url">${tab.url}</span>
          </a>
        `;
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
    const tabsPreview = collection.tabs.slice(0, 3).map((t) => t.title).join(', ');
    const moreCount = collection.tabs.length > 3 ? ` +${collection.tabs.length - 3} more` : '';
    collectionEl.innerHTML = `
      <div class="all-collections-header">
        <span class="all-collections-number">${idx + 1}.</span>
        <span class="all-collections-name">${collection.name}</span>
        <span class="all-collections-count">${collection.tabs.length} links</span>
      </div>
      ${collection.description ? `<p class="all-collections-desc">${collection.description}</p>` : ''}
      <div class="all-collections-preview">${tabsPreview}${moreCount}</div>
      <div class="all-collections-date">Created: ${new Date(collection.createdAt).toLocaleDateString()}</div>
    `;
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
    item.innerHTML = `
      <div class="collection-select-info">
        <div class="collection-select-name">${collection.name}</div>
        <div class="collection-select-count">${collection.tabs.length} links</div>
      </div>
      <button class="btn btn-small btn-primary">Add</button>
    `;
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
    if (previewContent) previewContent.innerHTML = `<p style="color: var(--danger-color);">Error: ${(error as Error).message}</p>`;
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
    header.innerHTML = `
      <span class="group-dot" style="background: var(--group-${group.color});"></span>
      <span>${group.name}</span>
      <span class="group-count">${group.tabs.length} tabs</span>
    `;
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

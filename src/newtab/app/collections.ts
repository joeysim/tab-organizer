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

let progressTimer: ReturnType<typeof setInterval> | undefined;
let aiAbort: AbortController | null = null;
/** Tab IDs that were candidates for grouping (ungrouped + http only). */
let aiCandidates: number[] | null = null;

/** Cancel any in-flight AI request (modal close, new click). */
export function cancelAISuggestions(): void {
  aiAbort?.abort();
  aiAbort = null;
  clearInterval(progressTimer);
  document.getElementById('aiProgress')?.classList.remove('active');
}

function setProgress(active: boolean, label: string): void {
  const bar = document.getElementById('aiProgress');
  const summary = document.getElementById('aiPreviewSummary');
  clearInterval(progressTimer);
  document.getElementById('aiWorkingDot')?.remove();
  if (bar) bar.classList.toggle('active', active);
  if (!active) {
    if (summary && label) summary.textContent = label;
    return;
  }
  const dot = document.createElement('span');
  dot.className = 'ai-working-dot';
  dot.id = 'aiWorkingDot';
  summary?.appendChild(dot);
  const started = Date.now();
  const tick = () => {
    if (!summary) return;
    const secs = Math.floor((Date.now() - started) / 1000);
    const textNode = Array.from(summary.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
    const text = `${label} · ${secs}s`;
    if (textNode) textNode.nodeValue = text;
    else summary.insertBefore(document.createTextNode(text), summary.firstChild);
  };
  tick();
  progressTimer = setInterval(tick, 250);
}

export async function handleAIOrganize(): Promise<void> {
  aiAbort?.abort();
  const ctrl = (aiAbort = new AbortController());
  // only ungrouped, real pages: already-grouped tabs keep their group,
  // and chrome://, about:, extension URLs are noise for the model
  const tabs = state.tabs
    .filter((t) => (t.groupId === -1 || t.groupId === undefined) && /^https?:/i.test(t.url))
    .map((t) => ({ id: t.id, title: t.title, url: t.url }));
  aiCandidates = tabs.map((t) => t.id);
  showModal('aiPreviewModal');
  const previewContent = document.getElementById('aiPreviewContent');
  const applyBtn = document.getElementById('applyAiBtn') as HTMLButtonElement | null;
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Analyzing…'; }

  if (tabs.length === 0) {
    setProgress(false, '');
    if (applyBtn) applyBtn.textContent = 'Nothing to apply';
    const summary = document.getElementById('aiPreviewSummary');
    if (summary) summary.textContent = 'No ungrouped tabs';
    if (previewContent) {
      previewContent.textContent = '';
      const p = document.createElement('p');
      p.className = 'ai-hint';
      p.textContent = 'Every open tab is already in a group. Ungroup some tabs first, or use the dashboard to create groups manually.';
      previewContent.appendChild(p);
    }
    return;
  }

  if (previewContent) {
    previewContent.innerHTML = `
      <div class="ai-skeleton-group">
        ${Array.from({ length: 4 }).map(() => `
          <div class="ai-skeleton-card">
            <div class="ai-skeleton-line head"></div>
            <div class="ai-skeleton-line"></div>
            <div class="ai-skeleton-line short"></div>
          </div>`).join('')}
      </div>`;
  }
  setProgress(true, `Analyzing ${tabs.length} ungrouped tab${tabs.length !== 1 ? 's' : ''}`);
  try {
    const providerName = (state.settings as unknown as { aiProvider?: 'claude' | 'lunaroute' }).aiProvider ?? 'lunaroute';
    const { getProvider } = await import('../../lib/ai/provider.js');
    const provider = await getProvider(providerName);
    if (!provider?.organizeTabs) throw new Error('AI not available');
    const result = await provider.organizeTabs(
      tabs as unknown as Parameters<typeof provider.organizeTabs>[0],
      state.settings.apiKey,
      { signal: ctrl.signal },
    );
    if (ctrl !== aiAbort) return; // superseded by a newer run or cancelled
    aiAbort = null;
    setProgress(false, '');
    aiSuggestions = result as typeof aiSuggestions;
    renderAIPreview(aiSuggestions!);
  } catch (error) {
    if (ctrl !== aiAbort) return; // cancelled — modal already closed
    aiAbort = null;
    setProgress(false, '');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Nothing to apply'; }
    const summary = document.getElementById('aiPreviewSummary');
    if (summary) summary.textContent = 'Failed';
    const message = (error as Error).name === 'TimeoutError'
      ? 'Request timed out — try again with fewer tabs'
      : (error as Error).message;
    if (previewContent) {
      previewContent.textContent = '';
      const p = document.createElement('p');
      p.style.color = 'var(--danger-color)';
      p.textContent = `Error: ${message}`;
      const hint = document.createElement('p');
      hint.className = 'ai-hint';
      hint.textContent = 'Check your API key and provider in Settings, then try again.';
      previewContent.append(p, hint);
    }
  }
}

/** Remove a tab from whichever group holds it. */
function removeTabFromPreview(tabId: number): void {
  if (!aiSuggestions) return;
  for (const g of aiSuggestions.groups) g.tabs = g.tabs.filter((id) => id !== tabId);
  renderAIPreview(aiSuggestions);
}

/** Move a tab into the group at targetIndex (no-op when already there). */
function moveTabToGroup(tabId: number, targetIndex: number): void {
  if (!aiSuggestions) return;
  const target = aiSuggestions.groups[targetIndex];
  if (!target || target.tabs.includes(tabId)) return;
  for (const g of aiSuggestions.groups) g.tabs = g.tabs.filter((id) => id !== tabId);
  target.tabs.push(tabId);
  renderAIPreview(aiSuggestions);
}

function renameGroup(index: number, name: string): void {
  if (!aiSuggestions) return;
  const group = aiSuggestions.groups[index];
  const trimmed = name.trim();
  if (group && trimmed) group.name = trimmed;
  renderAIPreview(aiSuggestions);
}

/** Build a dense, draggable tab row: favicon + title + host + remove. */
function createPreviewTabRow(tabId: number, groupName?: string): HTMLElement | null {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const row = document.createElement('div');
  row.className = 'ai-group-tab';
  row.draggable = true;
  row.dataset.tabId = String(tabId);

  let host = tab.url || '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }

  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.className = 'ai-group-tab-favicon';
    img.src = tab.favIconUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const ph = document.createElement('span');
      ph.className = 'ai-group-tab-fallback';
      ph.textContent = '·';
      img.replaceWith(ph);
    };
    row.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'ai-group-tab-fallback';
    ph.textContent = '·';
    row.appendChild(ph);
  }

  const title = document.createElement('span');
  title.className = 'ai-group-tab-title';
  title.textContent = tab.title || host || 'Untitled';
  title.title = `${tab.title || ''}\n${tab.url || ''}`;

  const hostEl = document.createElement('span');
  hostEl.className = 'ai-group-tab-host';
  hostEl.textContent = host;

  const remove = document.createElement('button');
  remove.className = 'ai-group-tab-remove';
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Remove ${tab.title || 'tab'}${groupName ? ` from ${groupName}` : ''}`);
  remove.addEventListener('click', (e) => { e.stopPropagation(); removeTabFromPreview(tabId); });

  row.append(title, hostEl, remove);
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    (e as DragEvent).dataTransfer?.setData('text/plain', String(tabId));
    if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });
  return row;
}

export function renderAIPreview(suggestions: { groups: Array<{ name: string; color: string; tabs: number[] }> }): void {
  const previewContent = document.getElementById('aiPreviewContent');
  if (!previewContent) return;
  // single source of truth: inline edits mutate this object, then re-render
  aiSuggestions = suggestions;
  previewContent.innerHTML = '';

  const groups = suggestions?.groups ?? [];
  const placed = new Set<number>(groups.flatMap((g) => g.tabs));
  // only offer the tabs the model was given; already-grouped tabs are untouched
  const candidateIds = aiCandidates ?? state.tabs.map((t) => t.id);
  const ungroupedTabs = candidateIds.filter((id) => !placed.has(id) && state.tabs.some((t) => t.id === id));
  const nonEmpty = groups.filter((g) => g.tabs.length > 0);
  const totalTabs = nonEmpty.reduce((n, g) => n + g.tabs.length, 0);

  const summary = document.getElementById('aiPreviewSummary');
  if (summary) {
    summary.textContent = nonEmpty.length
      ? `${nonEmpty.length} group${nonEmpty.length > 1 ? 's' : ''} · ${totalTabs} tab${totalTabs !== 1 ? 's' : ''} · drag to move, click a name to rename`
      : 'No groups suggested';
  }
  const applyBtn = document.getElementById('applyAiBtn') as HTMLButtonElement | null;
  if (applyBtn) {
    applyBtn.disabled = nonEmpty.length === 0;
    applyBtn.textContent = nonEmpty.length ? `Create ${nonEmpty.length} group${nonEmpty.length > 1 ? 's' : ''}` : 'Nothing to apply';
  }

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ai-hint';
    empty.textContent = 'The model did not find clear groupings. Try opening more related tabs, or group a selection manually.';
    previewContent.appendChild(empty);
    return;
  }

  groups.forEach((group, index) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'ai-group-preview';
    groupEl.dataset.groupIndex = String(index);
    const header = document.createElement('div');
    header.className = 'ai-group-header';
    const dot = document.createElement('span');
    dot.className = 'group-dot';
    (dot as HTMLElement).style.background = `var(--group-${group.color})`;

    // rename in place
    const nm = document.createElement('span');
    nm.className = 'ai-group-name';
    nm.textContent = group.name;
    nm.title = 'Click to rename';
    nm.tabIndex = 0;
    nm.addEventListener('click', () => {
      if (nm.getAttribute('contenteditable') === 'true') return;
      nm.setAttribute('contenteditable', 'true');
      nm.focus();
      const range = document.createRange();
      range.selectNodeContents(nm);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    const commit = () => {
      nm.removeAttribute('contenteditable');
      renameGroup(index, nm.textContent || group.name);
    };
    nm.addEventListener('blur', commit);
    nm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nm.blur(); }
      if (e.key === 'Escape') { nm.textContent = group.name; nm.removeAttribute('contenteditable'); nm.blur(); }
    });

    const gc = document.createElement('span');
    gc.className = 'group-count';
    gc.textContent = `${group.tabs.length} tab${group.tabs.length !== 1 ? 's' : ''}`;
    header.append(dot, nm, gc);

    const tabsList = document.createElement('div');
    tabsList.className = 'ai-group-tabs';
    group.tabs.forEach((tabId) => {
      const row = createPreviewTabRow(tabId, group.name);
      if (row) tabsList.appendChild(row);
    });

    groupEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      groupEl.classList.add('drag-over');
      if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.dropEffect = 'move';
    });
    groupEl.addEventListener('dragleave', () => groupEl.classList.remove('drag-over'));
    groupEl.addEventListener('drop', (e) => {
      e.preventDefault();
      groupEl.classList.remove('drag-over');
      const id = Number((e as DragEvent).dataTransfer?.getData('text/plain'));
      if (Number.isFinite(id)) moveTabToGroup(id, index);
    });

    groupEl.appendChild(header);
    groupEl.appendChild(tabsList);
    previewContent.appendChild(groupEl);
  });

  // Ungrouped zone: everything not in a group; dropping here removes it from groups
  const ungrouped = document.createElement('div');
  ungrouped.className = 'ai-ungrouped';
  const uHead = document.createElement('div');
  uHead.className = 'ai-ungrouped-header';
  const uDot = document.createElement('span');
  uDot.className = 'group-dot';
  (uDot as HTMLElement).style.background = 'var(--text-muted)';
  const uName = document.createElement('span');
  uName.textContent = 'Ungrouped';
  const uCount = document.createElement('span');
  uCount.className = 'group-count';
  uCount.textContent = `${ungroupedTabs.length} tab${ungroupedTabs.length !== 1 ? 's' : ''}`;
  uHead.append(uDot, uName, uCount);
  ungrouped.appendChild(uHead);

  const uList = document.createElement('div');
  uList.className = 'ai-ungrouped-list';
  if (ungroupedTabs.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'ai-ungrouped-empty';
    msg.textContent = 'All tabs are in groups — drop a tab here to leave it out.';
    uList.appendChild(msg);
  } else {
    ungroupedTabs.forEach((tabId) => {
      const row = createPreviewTabRow(tabId);
      if (row) uList.appendChild(row);
    });
  }
  ungrouped.appendChild(uList);

  ungrouped.addEventListener('dragover', (e) => {
    e.preventDefault();
    ungrouped.classList.add('drag-over');
    if ((e as DragEvent).dataTransfer) (e as DragEvent).dataTransfer!.dropEffect = 'move';
  });
  ungrouped.addEventListener('dragleave', () => ungrouped.classList.remove('drag-over'));
  ungrouped.addEventListener('drop', (e) => {
    e.preventDefault();
    ungrouped.classList.remove('drag-over');
    const id = Number((e as DragEvent).dataTransfer?.getData('text/plain'));
    if (Number.isFinite(id)) removeTabFromPreview(id);
  });

  previewContent.appendChild(ungrouped);
}

export async function applyAISuggestions(): Promise<void> {
  if (!aiSuggestions) return;
  for (const group of aiSuggestions.groups) {
    if (group.tabs.length === 0) continue;
    await chrome.runtime.sendMessage({ action: 'createGroup', name: group.name, color: group.color, tabIds: group.tabs });
  }
  aiSuggestions = null;
  const { loadTabs } = await import('./render.js');
  await loadTabs();
}

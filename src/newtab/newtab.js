// Tab Dashboard - Main Application
// Manages state, rendering, and event handling for the new tab page

// Available colors for groups
const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

// Track color index for round-robin assignment
let colorIndex = 0;

function getNextColor() {
  const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
  colorIndex++;
  return color;
}

function getRandomColor() {
  // Shuffle and pick to avoid predictable patterns
  const shuffled = [...GROUP_COLORS].sort(() => Math.random() - 0.5);
  return shuffled[0];
}

// App State
const state = {
  tabs: [],
  groups: [],
  collections: [],
  selectedTabs: new Set(),
  searchQuery: '',
  viewMode: 'grid',
  loading: true,
  currentCollection: null, // For viewing a collection
  activeGroupFilter: null, // null = All Tabs, or group id
  settings: {
    apiKey: '',
    darkMode: false
  }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSettings();
    await loadTabs();
    await loadCollections();
    setupEventListeners();
    setupLiveUpdates();
    setupGlobalDragHandler();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    document.getElementById('loading').innerHTML = `
      <p style="color: var(--danger-color);">Failed to load: ${error.message}</p>
      <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
    `;
  }
});

// Load settings from storage
async function loadSettings() {
  try {
    const stored = await Storage.getSettings();
    if (stored) {
      state.settings = stored;
      if (state.settings.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      const aiBtn = document.getElementById('aiOrganizeBtn');
      if (aiBtn) {
        aiBtn.disabled = !state.settings.apiKey;
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load tabs from background script
async function loadTabs(showLoading = true) {
  // Only show loading spinner on initial load, not on updates
  if (showLoading && state.tabs.length === 0) {
    state.loading = true;
    renderLoading();
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
    if (response.success) {
      state.tabs = response.tabs;
    }

    const groupResponse = await chrome.runtime.sendMessage({ action: 'getGroups' });
    if (groupResponse.success) {
      state.groups = groupResponse.groups;
    }
  } catch (error) {
    console.error('Failed to load tabs:', error);
  }

  state.loading = false;
  renderApp();
}

// Load collections from storage
async function loadCollections() {
  const collections = await CollectionManager.getCollections();
  state.collections = collections;
  renderCollections();
}

// Render the entire app
function renderApp() {
  renderTabCount();
  renderGroups();
  renderTabs();
  // Re-apply group filter after rendering
  if (state.activeGroupFilter !== null) {
    applyGroupFilter();
  }
}

// Render tab count
function renderTabCount() {
  const count = state.tabs.length;
  const pluralSuffix = count !== 1 ? 's' : '';
  document.getElementById('tabCount').textContent = `${count} tab${pluralSuffix}`;
}

// Render groups in sidebar
function renderGroups() {
  const groupList = document.getElementById('groupList');
  groupList.innerHTML = '';

  // Add "All Tabs" option
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

  // Add "Pinned" option if there are pinned tabs
  const pinnedTabs = state.tabs.filter(t => t.pinned);
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

  // Add actual groups (skip ungrouped with id -1, we'll add it separately)
  state.groups.forEach(group => {
    if (group.id === -1) return; // Handle ungrouped separately

    const groupEl = document.createElement('div');
    groupEl.className = 'group-item' + (state.activeGroupFilter === group.id ? ' active' : '');
    groupEl.dataset.groupId = group.id;

    const colorDot = document.createElement('button');
    colorDot.className = 'group-color-btn';
    colorDot.style.background = `var(--group-${group.color || 'grey'})`;
    colorDot.title = 'Change color';
    colorDot.addEventListener('click', (e) => {
      e.stopPropagation();
      showGroupColorPicker(groupEl, group);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = group.title || 'Untitled';

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = group.tabs.length;

    groupEl.appendChild(colorDot);
    groupEl.appendChild(nameSpan);
    groupEl.appendChild(countSpan);

    groupEl.addEventListener('click', () => {
      state.activeGroupFilter = group.id;
      applyGroupFilter();
    });

    // Drag and drop handler for adding tabs to groups
    groupEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    groupEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      groupEl.classList.remove('drag-over');

      try {
        const tabIds = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (tabIds.length > 0) {
          await chrome.runtime.sendMessage({
            action: 'addTabsToGroup',
            groupId: group.id,
            tabIds
          });
          showToast(`Added ${tabIds.length} tab${tabIds.length > 1 ? 's' : ''} to "${group.title || 'group'}"`, 'success');
          await loadTabs();
        }
      } catch (error) {
        console.error('Drop error:', error);
      }
    });

    groupList.appendChild(groupEl);
  });

  // Add "Ungrouped" option if there are ungrouped tabs
  const ungrouped = state.groups.find(g => g.id === -1);
  if (ungrouped && ungrouped.tabs.length > 0) {
    const ungroupedEl = document.createElement('div');
    ungroupedEl.className = 'group-item' + (state.activeGroupFilter === -1 ? ' active' : '');
    ungroupedEl.dataset.groupId = -1;

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

// Show color picker dropdown for a group
function showGroupColorPicker(groupEl, group) {
  // Remove any existing dropdown
  const existing = document.querySelector('.group-color-dropdown');
  if (existing) existing.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'group-color-dropdown';

  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  colors.forEach(color => {
    const option = document.createElement('button');
    option.className = 'color-option' + (group.color === color ? ' selected' : '');
    option.style.background = `var(--group-${color})`;
    option.addEventListener('click', async (e) => {
      e.stopPropagation();
      await changeGroupColor(group.id, color);
      dropdown.remove();
    });
    dropdown.appendChild(option);
  });

  groupEl.appendChild(dropdown);

  // Close dropdown when clicking outside
  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && e.target !== groupEl.querySelector('.group-color-btn')) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 0);
}

// Change a group's color
async function changeGroupColor(groupId, color) {
  try {
    await chrome.runtime.sendMessage({
      action: 'updateGroupColor',
      groupId,
      color
    });
    await loadTabs();
    showToast('Group color updated', 'success');
  } catch (error) {
    showToast('Failed to update color: ' + error.message, 'error');
  }
}

// Check if dragged element intersects with a target element, returns overlap area
function checkDragIntersection(e, targetEl) {
  if (!dragState.element) return 0;

  // Calculate dragged element's virtual bounds based on cursor position
  const dragLeft = e.clientX - dragState.offsetX;
  const dragTop = e.clientY - dragState.offsetY;
  const dragRight = dragLeft + dragState.width;
  const dragBottom = dragTop + dragState.height;

  // Get target bounds
  const targetRect = targetEl.getBoundingClientRect();

  // Calculate overlap area
  const overlapLeft = Math.max(dragLeft, targetRect.left);
  const overlapRight = Math.min(dragRight, targetRect.right);
  const overlapTop = Math.max(dragTop, targetRect.top);
  const overlapBottom = Math.min(dragBottom, targetRect.bottom);

  const overlapWidth = overlapRight - overlapLeft;
  const overlapHeight = overlapBottom - overlapTop;

  // Return overlap area (0 if no intersection)
  if (overlapWidth > 0 && overlapHeight > 0) {
    return overlapWidth * overlapHeight;
  }
  return 0;
}

// Global dragover handler for intersection-based detection
function setupGlobalDragHandler() {
  document.addEventListener('dragover', (e) => {
    if (!dragState.element) return;

    // Clear all existing highlights first
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    // Check all drop targets for intersection and find the best one
    const dropTargets = document.querySelectorAll('.group-item[data-group-id]:not([data-group-id="-1"]):not([data-group-id="pinned"]), .collection-item[data-collection-id]');

    let bestTarget = null;
    let bestOverlap = 0;

    dropTargets.forEach(target => {
      const overlap = checkDragIntersection(e, target);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestTarget = target;
      }
    });

    // Only highlight the best matching target
    if (bestTarget) {
      bestTarget.classList.add('drag-over');
    }
  });
}

// Apply the current group filter to the UI
function applyGroupFilter() {
  // Update sidebar active state
  document.querySelectorAll('.group-item').forEach(el => {
    const groupId = el.dataset.groupId;
    const isAllTabs = state.activeGroupFilter === null && !groupId;
    const isPinnedFilter = state.activeGroupFilter === 'pinned' && groupId === 'pinned';
    const isMatchingGroup = groupId !== undefined && groupId !== 'pinned' && parseInt(groupId) === state.activeGroupFilter;
    el.classList.toggle('active', isAllTabs || isPinnedFilter || isMatchingGroup);
  });

  // Determine which tabs should be visible
  let visibleTabIds = null;
  if (state.activeGroupFilter === 'pinned') {
    // Show only pinned tabs
    visibleTabIds = new Set(state.tabs.filter(t => t.pinned).map(t => t.id));
  } else if (state.activeGroupFilter !== null) {
    const group = state.groups.find(g => g.id === state.activeGroupFilter);
    visibleTabIds = group ? new Set(group.tabs.map(t => t.id)) : null;
  }

  // Filter tabs in grid
  state.tabs.forEach(tab => {
    const card = getTabCard(tab.id);
    if (card) {
      const isVisible = visibleTabIds === null || visibleTabIds.has(tab.id);
      card.style.display = isVisible ? '' : 'none';
    }
  });
}

function showAllTabs() {
  state.activeGroupFilter = null;
  applyGroupFilter();
}

// Render tabs in grid/list
function renderTabs() {
  const tabGrid = document.getElementById('tabGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('loading');

  loading.style.display = 'none';

  // Filter tabs based on search
  let filteredTabs = state.tabs;
  if (state.searchQuery) {
    filteredTabs = Search.searchTabs(state.tabs, state.searchQuery);
  }

  if (filteredTabs.length === 0) {
    tabGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tabGrid.innerHTML = '';
  tabGrid.className = state.viewMode === 'list' ? 'tab-grid list-view' : 'tab-grid';

  filteredTabs.forEach(tab => {
    const tabCard = createTabCard(tab);
    tabGrid.appendChild(tabCard);
  });

  updateSelectionInfo();
}

// Drag state for intersection-based drop detection
const dragState = {
  element: null,
  offsetX: 0,
  offsetY: 0,
  width: 0,
  height: 0
};

// Create a tab card element
function createTabCard(tab) {
  const card = document.createElement('div');
  card.className = 'tab-card';
  card.dataset.tabId = tab.id;
  card.draggable = true;

  // Drag and drop handlers
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');

    // Store drag element info for intersection detection
    const rect = card.getBoundingClientRect();
    dragState.element = card;
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;
    dragState.width = rect.width;
    dragState.height = rect.height;

    // If the dragged tab is selected, drag all selected tabs; otherwise just this one
    if (state.selectedTabs.has(tab.id)) {
      e.dataTransfer.setData('text/plain', JSON.stringify(Array.from(state.selectedTabs)));
    } else {
      e.dataTransfer.setData('text/plain', JSON.stringify([tab.id]));
    }
    e.dataTransfer.effectAllowed = 'copy';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragState.element = null;
    // Clear all drag-over states
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  if (state.selectedTabs.has(tab.id)) {
    card.classList.add('selected');
  }

  if (tab.pinned) {
    card.classList.add('pinned');
  }

  // Group color indicator
  if (tab.groupId && tab.groupId !== -1) {
    const groupIndicator = document.createElement('div');
    groupIndicator.className = 'tab-group-indicator';
    groupIndicator.style.background = `var(--group-${tab.groupColor || 'grey'})`;
    card.appendChild(groupIndicator);
  }

  const header = document.createElement('div');
  header.className = 'tab-card-header';

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tab-checkbox';
  checkbox.checked = state.selectedTabs.has(tab.id);
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTabSelection(tab.id);
  });

  // Favicon
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

  // Tab info
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
  } catch (e) {
    url.textContent = tab.url || 'No URL';
  }

  info.appendChild(title);
  info.appendChild(url);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tab.id);
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

  // Click to activate tab
  card.addEventListener('click', (e) => {
    // If clicking the card (not checkbox), activate the tab
    if (e.target === card || e.target.closest('.tab-info')) {
      activateTab(tab.id);
    }
  });

  return card;
}

// Render collections in sidebar
function renderCollections() {
  const collectionList = document.getElementById('collectionList');
  collectionList.innerHTML = '';

  if (state.collections.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'collection-empty';
    emptyEl.textContent = 'No collections yet';
    collectionList.appendChild(emptyEl);
    return;
  }

  state.collections.forEach(collection => {
    const collectionEl = document.createElement('div');
    collectionEl.className = 'collection-item';
    collectionEl.dataset.collectionId = collection.id;

    collectionEl.innerHTML = `
      <div class="collection-info">
        <div class="collection-name">${collection.name}</div>
        <div class="collection-count">${collection.tabs.length} links</div>
      </div>
    `;

    // Click to view collection
    collectionEl.addEventListener('click', () => viewCollection(collection.id));

    // Drag and drop handler for adding tabs to collections
    collectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    collectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      collectionEl.classList.remove('drag-over');

      try {
        const tabIds = JSON.parse(e.dataTransfer.getData('text/plain'));
        const tabsToAdd = state.tabs
          .filter(t => tabIds.includes(t.id))
          .map(t => ({ url: t.url, title: t.title }));

        if (tabsToAdd.length > 0) {
          await CollectionManager.addTabsToCollection(collection.id, tabsToAdd);
          await loadCollections();
          showToast(`Added ${tabsToAdd.length} tab${tabsToAdd.length > 1 ? 's' : ''} to "${collection.name}"`, 'success');
        }
      } catch (error) {
        console.error('Drop error:', error);
      }
    });

    collectionList.appendChild(collectionEl);
  });
}

// Render loading state
function renderLoading() {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('tabGrid').innerHTML = '';
  document.getElementById('emptyState').style.display = 'none';
}

// Helper to get tab card element by ID
function getTabCard(tabId) {
  return document.querySelector(`[data-tab-id="${tabId}"]`);
}

// Helper to update a card's selection state
function updateCardSelectionState(card, isSelected) {
  card.classList.toggle('selected', isSelected);
  const checkbox = card.querySelector('.tab-checkbox');
  if (checkbox) {
    checkbox.checked = isSelected;
  }
}

// Tab selection
function toggleTabSelection(tabId) {
  if (state.selectedTabs.has(tabId)) {
    state.selectedTabs.delete(tabId);
  } else {
    state.selectedTabs.add(tabId);
  }

  const card = getTabCard(tabId);
  if (card) {
    updateCardSelectionState(card, state.selectedTabs.has(tabId));
  }

  updateSelectionInfo();
}

function selectAllTabs() {
  // Only select visible tabs (not hidden by group filter)
  document.querySelectorAll('.tab-card').forEach(card => {
    if (card.style.display !== 'none') {
      const tabId = parseInt(card.dataset.tabId);
      state.selectedTabs.add(tabId);
      updateCardSelectionState(card, true);
    }
  });
  updateSelectionInfo();
}

function deselectAllTabs() {
  state.selectedTabs.clear();
  document.querySelectorAll('.tab-card').forEach(card => {
    updateCardSelectionState(card, false);
  });
  updateSelectionInfo();
}

// Update selection info bar
function updateSelectionInfo() {
  const selectionInfo = document.getElementById('selectionInfo');
  const selectedCount = document.getElementById('selectedCount');

  if (state.selectedTabs.size > 0) {
    selectionInfo.style.display = 'flex';
    selectedCount.textContent = `${state.selectedTabs.size} selected`;
  } else {
    selectionInfo.style.display = 'none';
  }
}

// Tab actions
async function activateTab(tabId) {
  await chrome.runtime.sendMessage({ action: 'activateTab', tabId });
}

async function closeTab(tabId) {
  await chrome.runtime.sendMessage({ action: 'closeTab', tabId });
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  state.selectedTabs.delete(tabId);
  renderApp();
}

async function closeSelectedTabs() {
  if (state.selectedTabs.size === 0) return;

  const tabIds = Array.from(state.selectedTabs);
  await chrome.runtime.sendMessage({ action: 'closeTabs', tabIds });

  state.tabs = state.tabs.filter(t => !state.selectedTabs.has(t.id));
  state.selectedTabs.clear();
  renderApp();
}

// Group actions
async function createGroup(name, color) {
  if (state.selectedTabs.size === 0) return;

  // Use next color in rotation if not specified
  const groupColor = color || getNextColor();

  const tabIds = Array.from(state.selectedTabs);
  const response = await chrome.runtime.sendMessage({
    action: 'createGroup',
    name,
    color: groupColor,
    tabIds
  });

  if (response.success) {
    state.selectedTabs.clear();
    await loadTabs();
  }
}

function filterByGroup(groupId) {
  state.activeGroupFilter = groupId;
  applyGroupFilter();
}

// Collection actions
async function saveCollection(name, description) {
  if (state.selectedTabs.size === 0) {
    showToast('Please select tabs first', 'error');
    return;
  }

  const selectedTabData = state.tabs
    .filter(t => state.selectedTabs.has(t.id))
    .map(t => ({
      url: t.url,
      title: t.title
    }));

  await CollectionManager.saveCollection(name, description, selectedTabData);
  await loadCollections();
  showToast(`Collection "${name}" saved with ${selectedTabData.length} links`, 'success');

  // Keep tabs selected so user can close them
  // Don't clear: state.selectedTabs.clear();
}

async function viewCollection(collectionId) {
  const collection = await CollectionManager.getCollection(collectionId);
  if (!collection) return;

  state.currentCollection = collection;

  document.getElementById('viewCollectionTitle').textContent = collection.name;
  document.getElementById('viewCollectionDescription').textContent = collection.description || '';

  const tabsContainer = document.getElementById('viewCollectionTabs');
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

async function deleteCurrentCollection() {
  if (!state.currentCollection) return;

  await CollectionManager.deleteCollection(state.currentCollection.id);
  await loadCollections();
  hideModal();
  showToast('Collection deleted', 'success');
}

async function reopenCurrentCollection() {
  if (!state.currentCollection) return;

  await CollectionManager.reopenCollection(state.currentCollection.id);
  hideModal();
  showToast(`Opened ${state.currentCollection.tabs.length} tabs`, 'success');
}

async function copyCurrentCollection() {
  if (!state.currentCollection) return;

  await CollectionManager.copyToClipboard(state.currentCollection);
  showToast('Copied to clipboard', 'success');
}

function downloadCurrentCollection() {
  if (!state.currentCollection) return;

  CollectionManager.downloadAsMarkdown(state.currentCollection);
  showToast('Downloaded as Markdown', 'success');
}

// Add link form functions
function showAddLinkForm() {
  document.getElementById('addLinkForm').style.display = 'block';
  document.getElementById('addLinkUrl').value = '';
  document.getElementById('addLinkTitle').value = '';
  document.getElementById('addLinkUrl').focus();
}

function hideAddLinkForm() {
  document.getElementById('addLinkForm').style.display = 'none';
  document.getElementById('addLinkUrl').value = '';
  document.getElementById('addLinkTitle').value = '';
}

async function addLinkToCurrentCollection() {
  if (!state.currentCollection) return;

  const url = document.getElementById('addLinkUrl').value.trim();
  const title = document.getElementById('addLinkTitle').value.trim();

  if (!url) {
    showToast('Please enter a URL', 'error');
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (e) {
    showToast('Please enter a valid URL', 'error');
    return;
  }

  try {
    const updatedCollection = await CollectionManager.addToCollection(
      state.currentCollection.id,
      { url, title: title || url }
    );

    // Update the current collection and refresh the view
    state.currentCollection = updatedCollection;
    hideAddLinkForm();

    // Re-render the tabs list
    const tabsContainer = document.getElementById('viewCollectionTabs');
    tabsContainer.innerHTML = '';

    updatedCollection.tabs.forEach((tab, index) => {
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

    showToast('Link added to collection', 'success');
  } catch (error) {
    showToast('Failed to add link: ' + error.message, 'error');
  }
}

// View all collections
async function viewAllCollections() {
  const collections = await CollectionManager.getCollections();
  const container = document.getElementById('allCollectionsList');
  container.innerHTML = '';

  if (collections.length === 0) {
    container.innerHTML = '<p class="collection-empty">No collections saved yet. Select tabs and save them as a collection.</p>';
    showModal('viewAllCollectionsModal');
    return;
  }

  collections.forEach((collection, idx) => {
    const collectionEl = document.createElement('div');
    collectionEl.className = 'all-collections-item';

    const tabsPreview = collection.tabs.slice(0, 3).map(t => t.title).join(', ');
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

async function copyAllCollections() {
  await CollectionManager.copyAllToClipboard();
  showToast('All collections copied to clipboard', 'success');
}

async function downloadAllCollections() {
  await CollectionManager.downloadAllAsMarkdown();
  showToast('All collections downloaded as Markdown', 'success');
}

// Add to existing collection
async function showAddToCollectionModal() {
  const collections = await CollectionManager.getCollections();
  const container = document.getElementById('collectionSelectList');
  container.innerHTML = '';

  document.getElementById('addToCollectionInfo').textContent = `${state.selectedTabs.size} tabs selected`;

  if (collections.length === 0) {
    container.innerHTML = '<p class="collection-select-empty">No collections yet. Create a new collection first.</p>';
    showModal('addToCollectionModal');
    return;
  }

  collections.forEach(collection => {
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

async function addSelectedTabsToCollection(collectionId) {
  if (state.selectedTabs.size === 0) {
    showToast('No tabs selected', 'error');
    return;
  }

  const selectedTabData = state.tabs
    .filter(t => state.selectedTabs.has(t.id))
    .map(t => ({
      url: t.url,
      title: t.title
    }));

  try {
    await CollectionManager.addTabsToCollection(collectionId, selectedTabData);
    await loadCollections();
    hideModal();
    showToast(`Added ${selectedTabData.length} tabs to collection`, 'success');
  } catch (error) {
    showToast('Failed to add tabs: ' + error.message, 'error');
  }
}

// Search
function handleSearch(query) {
  state.searchQuery = query;
  renderTabs();
}

// Setup event listeners
function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      handleSearch(e.target.value);
    }, 300);
  });

  // View toggle
  document.getElementById('viewToggle').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    renderTabs();
  });

  // Select all / Deselect all
  document.getElementById('selectAllBtn').addEventListener('click', selectAllTabs);
  document.getElementById('deselectAllBtn').addEventListener('click', deselectAllTabs);

  // Selection actions
  document.getElementById('groupSelectedBtn').addEventListener('click', () => {
    if (state.selectedTabs.size > 0) {
      showGroupModal();
    }
  });

  document.getElementById('collectionSelectedBtn').addEventListener('click', () => {
    if (state.selectedTabs.size > 0) {
      showCollectionModal();
    }
  });

  document.getElementById('closeSelectedBtn').addEventListener('click', () => {
    closeSelectedTabs();
  });

  // Add to existing collection button
  document.getElementById('addToCollectionBtn').addEventListener('click', () => {
    if (state.selectedTabs.size > 0) {
      showAddToCollectionModal();
    }
  });

  // Create group button (sidebar)
  document.getElementById('createGroupBtn').addEventListener('click', () => {
    if (state.selectedTabs.size > 0) {
      showGroupModal();
    } else {
      showToast('Select tabs first', 'error');
    }
  });

  // Save collection button (sidebar)
  document.getElementById('saveCollectionBtn').addEventListener('click', () => {
    if (state.selectedTabs.size > 0) {
      showCollectionModal();
    } else {
      showToast('Select tabs first', 'error');
    }
  });

  // View all collections button (sidebar)
  document.getElementById('viewAllCollectionsBtn').addEventListener('click', () => {
    viewAllCollections();
  });

  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    showSettingsModal();
  });

  // AI Organize button
  document.getElementById('aiOrganizeBtn').addEventListener('click', async () => {
    if (!state.settings.apiKey) {
      showSettingsModal();
      return;
    }
    await handleAIOrganize();
  });

  // Modal event listeners
  setupModalListeners();
}

// Setup modal listeners
function setupModalListeners() {
  const overlay = document.getElementById('modalOverlay');

  // Group modal
  document.getElementById('closeGroupModal').addEventListener('click', () => hideModal());
  document.getElementById('cancelGroupBtn').addEventListener('click', () => hideModal());
  document.getElementById('confirmGroupBtn').addEventListener('click', async () => {
    const name = document.getElementById('groupName').value || 'New Group';
    const colorBtn = document.querySelector('.color-btn.selected');
    const color = colorBtn ? colorBtn.dataset.color : getRandomColor();
    await createGroup(name, color);
    hideModal();
  });

  // Color picker - select random by default
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Collection modal
  document.getElementById('closeCollectionModal').addEventListener('click', () => hideModal());
  document.getElementById('cancelCollectionBtn').addEventListener('click', () => hideModal());
  document.getElementById('confirmCollectionBtn').addEventListener('click', async () => {
    const name = document.getElementById('collectionName').value;
    const description = document.getElementById('collectionDescription').value;
    if (name) {
      await saveCollection(name, description);
      hideModal();
    } else {
      showToast('Please enter a collection name', 'error');
    }
  });

  // View collection modal
  document.getElementById('closeViewCollectionModal').addEventListener('click', () => hideModal());
  document.getElementById('closeViewCollectionBtn').addEventListener('click', () => hideModal());
  document.getElementById('copyCollectionBtn').addEventListener('click', copyCurrentCollection);
  document.getElementById('downloadCollectionBtn').addEventListener('click', downloadCurrentCollection);
  document.getElementById('reopenCollectionBtn').addEventListener('click', reopenCurrentCollection);
  document.getElementById('deleteCollectionBtn').addEventListener('click', deleteCurrentCollection);

  // Add link to collection
  document.getElementById('addLinkBtn').addEventListener('click', showAddLinkForm);
  document.getElementById('cancelAddLinkBtn').addEventListener('click', hideAddLinkForm);
  document.getElementById('confirmAddLinkBtn').addEventListener('click', addLinkToCurrentCollection);

  // View all collections modal
  document.getElementById('closeViewAllCollectionsModal').addEventListener('click', () => hideModal());
  document.getElementById('closeViewAllCollectionsBtn').addEventListener('click', () => hideModal());
  document.getElementById('copyAllCollectionsBtn').addEventListener('click', copyAllCollections);
  document.getElementById('downloadAllCollectionsBtn').addEventListener('click', downloadAllCollections);

  // Add to collection modal
  document.getElementById('closeAddToCollectionModal').addEventListener('click', () => hideModal());
  document.getElementById('cancelAddToCollectionBtn').addEventListener('click', () => hideModal());

  // Settings modal
  document.getElementById('closeSettingsModal').addEventListener('click', () => hideModal());
  document.getElementById('cancelSettingsBtn').addEventListener('click', () => hideModal());
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value;
    const darkMode = document.getElementById('darkModeToggle').checked;

    state.settings = { apiKey, darkMode };
    await Storage.saveSettings(state.settings);

    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    document.getElementById('aiOrganizeBtn').disabled = !apiKey;
    hideModal();
  });

  // AI Preview modal
  document.getElementById('closeAiPreviewModal').addEventListener('click', () => hideModal());
  document.getElementById('cancelAiBtn').addEventListener('click', () => hideModal());
  document.getElementById('applyAiBtn').addEventListener('click', async () => {
    await applyAISuggestions();
    hideModal();
  });

  // Close modal on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideModal();
    }
  });
}

// Modal helpers
function showModal(modalId) {
  document.getElementById('modalOverlay').classList.add('active');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById(modalId).style.display = 'block';
}

function hideModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');

  // Clear inputs
  const groupName = document.getElementById('groupName');
  if (groupName) groupName.value = '';

  const collectionName = document.getElementById('collectionName');
  if (collectionName) collectionName.value = '';

  const collectionDescription = document.getElementById('collectionDescription');
  if (collectionDescription) collectionDescription.value = '';

  // Hide add link form
  const addLinkForm = document.getElementById('addLinkForm');
  if (addLinkForm) addLinkForm.style.display = 'none';
}

function showGroupModal() {
  // Select a random color by default
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(b => b.classList.remove('selected'));
  const randomIndex = Math.floor(Math.random() * colorBtns.length);
  colorBtns[randomIndex].classList.add('selected');

  showModal('groupModal');
  document.getElementById('groupName').focus();
}

function showCollectionModal() {
  document.getElementById('collectionTabCount').textContent = `${state.selectedTabs.size} tabs selected`;
  showModal('collectionModal');
  document.getElementById('collectionName').focus();
}

function showSettingsModal() {
  showModal('settingsModal');
  document.getElementById('apiKey').value = state.settings.apiKey || '';
  document.getElementById('darkModeToggle').checked = state.settings.darkMode || false;
}

// AI Organization
let aiSuggestions = null;

async function handleAIOrganize() {
  const tabs = state.tabs.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url
  }));

  showModal('aiPreviewModal');
  const previewContent = document.getElementById('aiPreviewContent');
  previewContent.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Analyzing tabs...</p></div>';

  try {
    aiSuggestions = await AI.organizeTabs(tabs, state.settings.apiKey);
    renderAIPreview(aiSuggestions);
  } catch (error) {
    previewContent.innerHTML = `<p style="color: var(--danger-color);">Error: ${error.message}</p>`;
  }
}

function renderAIPreview(suggestions) {
  const previewContent = document.getElementById('aiPreviewContent');
  previewContent.innerHTML = '';

  suggestions.groups.forEach(group => {
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

    group.tabs.forEach(tabId => {
      const tab = state.tabs.find(t => t.id === tabId);
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

async function applyAISuggestions() {
  if (!aiSuggestions) return;

  for (const group of aiSuggestions.groups) {
    await chrome.runtime.sendMessage({
      action: 'createGroup',
      name: group.name,
      color: group.color,
      tabIds: group.tabs
    });
  }

  aiSuggestions = null;
  await loadTabs();
}

// Setup live updates
function setupLiveUpdates() {
  let updateTimeout;
  const debouncedLoadTabs = () => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => loadTabs(), 100);
  };

  chrome.tabs.onCreated.addListener(debouncedLoadTabs);
  chrome.tabs.onRemoved.addListener(debouncedLoadTabs);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
      debouncedLoadTabs();
    }
  });

  if (chrome.tabGroups) {
    chrome.tabGroups.onCreated?.addListener(debouncedLoadTabs);
    chrome.tabGroups.onUpdated?.addListener(debouncedLoadTabs);
    chrome.tabGroups.onRemoved?.addListener(debouncedLoadTabs);
  }
}

// Show toast notifications
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Keyboard navigation
function setupKeyboardNavigation() {
  let focusedIndex = -1;

  document.addEventListener('keydown', (e) => {
    const cards = Array.from(document.querySelectorAll('.tab-card'));
    if (cards.length === 0) return;

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
        focusedIndex = -1;
        updateFocusedCard(cards, focusedIndex);
      }
      return;
    }

    if (document.getElementById('modalOverlay').classList.contains('active')) {
      if (e.key === 'Escape') {
        hideModal();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, cards.length - 1);
        updateFocusedCard(cards, focusedIndex);
        break;

      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        updateFocusedCard(cards, focusedIndex);
        break;

      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt(cards[focusedIndex].dataset.tabId);
          activateTab(tabId);
        }
        break;

      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt(cards[focusedIndex].dataset.tabId);
          toggleTabSelection(tabId);
        }
        break;

      case 'x':
      case 'Delete':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt(cards[focusedIndex].dataset.tabId);
          closeTab(tabId);
          focusedIndex = Math.min(focusedIndex, cards.length - 2);
        }
        break;

      case '/':
        e.preventDefault();
        document.getElementById('searchInput').focus();
        break;

      case 'Escape':
        e.preventDefault();
        deselectAllTabs();
        focusedIndex = -1;
        updateFocusedCard(cards, focusedIndex);
        break;

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          selectAllTabs();
        }
        break;

      case 'g':
        e.preventDefault();
        if (state.selectedTabs.size > 0) {
          showGroupModal();
        }
        break;

      case 'c':
        e.preventDefault();
        if (state.selectedTabs.size > 0) {
          showCollectionModal();
        }
        break;
    }
  });

  function updateFocusedCard(cards, index) {
    cards.forEach((card, i) => {
      card.classList.toggle('focused', i === index);
    });
    if (index >= 0 && cards[index]) {
      cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// Detect system dark mode preference
function detectSystemTheme() {
  if (state.settings.darkMode !== undefined) return;

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (state.settings.darkMode !== undefined) return;
    if (e.matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });
}

// Initialize keyboard navigation and theme detection on load
document.addEventListener('DOMContentLoaded', () => {
  setupKeyboardNavigation();
  detectSystemTheme();
});

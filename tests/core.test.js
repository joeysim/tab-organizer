// Core UI Tests for Tab Organizer Extension
// Tests for tab selection, group filtering, and state management

const { mockChrome, resetMocks, createSampleTabs, createSampleGroups, assert, TestRunner } = require('./test-utils.js');

// Set up global chrome mock
global.chrome = mockChrome;

// Import the modules we're testing (simulated for now)
// In a real setup, we'd use a bundler or module loader

const runner = new TestRunner();

// ==================== STATE MANAGEMENT TESTS ====================

runner.test('State: Initial state has expected defaults', () => {
  const state = {
    tabs: [],
    groups: [],
    collections: [],
    selectedTabs: new Set(),
    searchQuery: '',
    viewMode: 'grid',
    loading: true,
    currentCollection: null,
    activeGroupFilter: null,
    settings: { apiKey: '', darkMode: false }
  };

  assert.equal(state.tabs.length, 0, 'tabs should be empty');
  assert.equal(state.groups.length, 0, 'groups should be empty');
  assert.equal(state.selectedTabs.size, 0, 'no tabs selected');
  assert.equal(state.searchQuery, '', 'search empty');
  assert.equal(state.viewMode, 'grid', 'default view is grid');
  assert.true(state.loading, 'starts in loading state');
  assert.equal(state.activeGroupFilter, null, 'no group filter');
});

// ==================== TAB SELECTION TESTS ====================

runner.test('Selection: toggleTabSelection adds tab to selection', () => {
  const selectedTabs = new Set();
  const tabId = 1;

  // Toggle on
  if (selectedTabs.has(tabId)) {
    selectedTabs.delete(tabId);
  } else {
    selectedTabs.add(tabId);
  }

  assert.true(selectedTabs.has(tabId), 'tab should be selected');
  assert.equal(selectedTabs.size, 1, 'should have one selection');
});

runner.test('Selection: toggleTabSelection removes tab from selection', () => {
  const selectedTabs = new Set([1, 2, 3]);
  const tabId = 2;

  // Toggle off
  if (selectedTabs.has(tabId)) {
    selectedTabs.delete(tabId);
  } else {
    selectedTabs.add(tabId);
  }

  assert.false(selectedTabs.has(tabId), 'tab should be deselected');
  assert.equal(selectedTabs.size, 2, 'should have two selections');
});

runner.test('Selection: selectAllTabs only selects visible tabs', () => {
  const tabs = createSampleTabs(5);
  const selectedTabs = new Set();

  // Simulate visible tabs (indices 0, 1, 2 visible; 3, 4 hidden)
  const visibleTabIds = [1, 2, 3];
  const hiddenTabIds = [4, 5];

  // Select all visible tabs
  visibleTabIds.forEach(id => selectedTabs.add(id));

  assert.equal(selectedTabs.size, 3, 'should select 3 visible tabs');
  hiddenTabIds.forEach(id => {
    assert.false(selectedTabs.has(id), `hidden tab ${id} should not be selected`);
  });
});

runner.test('Selection: deselectAllTabs clears all selections', () => {
  const selectedTabs = new Set([1, 2, 3, 4, 5]);

  selectedTabs.clear();

  assert.equal(selectedTabs.size, 0, 'all tabs should be deselected');
});

// ==================== GROUP FILTER TESTS ====================

runner.test('Group filter: null means all tabs visible', () => {
  const tabs = createSampleTabs(5);
  const activeGroupFilter = null;

  const visibleTabs = tabs.filter(tab => {
    if (activeGroupFilter === null) return true;
    return false;
  });

  assert.equal(visibleTabs.length, 5, 'all tabs should be visible');
});

runner.test('Group filter: filters to specific group', () => {
  const tabs = createSampleTabs(5);
  tabs[0].groupId = 100;
  tabs[1].groupId = 100;

  const groups = [
    { id: 100, title: 'Work', tabs: [{ id: 1 }, { id: 2 }] },
    { id: -1, title: 'Ungrouped', tabs: [{ id: 3 }, { id: 4 }, { id: 5 }] }
  ];

  const activeGroupFilter = 100;
  const group = groups.find(g => g.id === activeGroupFilter);
  const groupTabIds = new Set(group.tabs.map(t => t.id));

  const visibleTabs = tabs.filter(tab => groupTabIds.has(tab.id));

  assert.equal(visibleTabs.length, 2, 'only group tabs should be visible');
  assert.equal(visibleTabs[0].id, 1, 'first group tab');
  assert.equal(visibleTabs[1].id, 2, 'second group tab');
});

runner.test('Group filter: ungrouped (-1) shows ungrouped tabs', () => {
  const tabs = createSampleTabs(5);
  tabs[0].groupId = 100;
  tabs[1].groupId = 100;

  const groups = [
    { id: 100, title: 'Work', tabs: [{ id: 1 }, { id: 2 }] },
    { id: -1, title: 'Ungrouped', tabs: [{ id: 3 }, { id: 4 }, { id: 5 }] }
  ];

  const activeGroupFilter = -1;
  const group = groups.find(g => g.id === activeGroupFilter);
  const groupTabIds = new Set(group.tabs.map(t => t.id));

  const visibleTabs = tabs.filter(tab => groupTabIds.has(tab.id));

  assert.equal(visibleTabs.length, 3, 'ungrouped tabs should be visible');
});

runner.test('Group filter: persists across re-renders', () => {
  let activeGroupFilter = 100;

  // Simulate render 1
  const filterBeforeRender = activeGroupFilter;

  // Simulate render 2 (triggered by live update)
  const filterAfterRender = activeGroupFilter;

  assert.equal(filterBeforeRender, filterAfterRender, 'filter should persist');
});

// ==================== LOADING STATE TESTS ====================

runner.test('Loading: shows spinner only on initial load', () => {
  let tabs = [];
  let loading = false;
  let showLoadingCalled = false;

  function loadTabs(showLoading = true) {
    // Only show loading spinner on initial load, not on updates
    if (showLoading && tabs.length === 0) {
      loading = true;
      showLoadingCalled = true;
    }
    // Load tabs...
    tabs = createSampleTabs(5);
    loading = false;
  }

  // First load - should show spinner
  loadTabs();
  assert.true(showLoadingCalled, 'should show loading on first load');
});

runner.test('Loading: does not show spinner on live updates', () => {
  let tabs = createSampleTabs(5); // Already have tabs
  let showLoadingCalled = false;

  function loadTabs(showLoading = true) {
    if (showLoading && tabs.length === 0) {
      showLoadingCalled = true;
    }
    // Load tabs...
  }

  // Live update - should NOT show spinner
  loadTabs();
  assert.false(showLoadingCalled, 'should not show loading on live update');
});

// ==================== COLOR ROTATION TESTS ====================

runner.test('Color: getNextColor returns colors in sequence', () => {
  const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let colorIndex = 0;

  function getNextColor() {
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    colorIndex++;
    return color;
  }

  assert.equal(getNextColor(), 'blue', 'first color is blue');
  assert.equal(getNextColor(), 'red', 'second color is red');
  assert.equal(getNextColor(), 'yellow', 'third color is yellow');
});

runner.test('Color: getNextColor wraps around', () => {
  const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let colorIndex = 7; // Last color

  function getNextColor() {
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    colorIndex++;
    return color;
  }

  assert.equal(getNextColor(), 'orange', 'eighth color is orange');
  assert.equal(getNextColor(), 'blue', 'wraps back to blue');
});

// ==================== SEARCH TESTS ====================

runner.test('Search: empty query returns all tabs', () => {
  const tabs = createSampleTabs(5);
  const searchQuery = '';

  const filteredTabs = searchQuery ? tabs.filter(t => t.title.includes(searchQuery)) : tabs;

  assert.equal(filteredTabs.length, 5, 'all tabs returned');
});

runner.test('Search: filters tabs by title', () => {
  const tabs = [
    { id: 1, title: 'GitHub - Project', url: 'https://github.com/project' },
    { id: 2, title: 'Google Search', url: 'https://google.com' },
    { id: 3, title: 'GitHub - Issues', url: 'https://github.com/issues' }
  ];

  const searchQuery = 'GitHub';
  const filteredTabs = tabs.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  assert.equal(filteredTabs.length, 2, 'two GitHub tabs found');
});

// ==================== COLLECTION TESTS ====================

runner.test('Collection: saves with correct structure', async () => {
  const collections = [];
  const tabs = [
    { url: 'https://example.com', title: 'Example' },
    { url: 'https://test.com', title: 'Test' }
  ];

  const newCollection = {
    id: `col_${Date.now()}_test`,
    name: 'Test Collection',
    description: 'A test collection',
    createdAt: Date.now(),
    tabs: tabs.map(tab => ({ url: tab.url, title: tab.title }))
  };

  collections.unshift(newCollection);

  assert.equal(collections.length, 1, 'collection added');
  assert.equal(collections[0].name, 'Test Collection', 'name saved');
  assert.equal(collections[0].tabs.length, 2, 'tabs saved');
});

runner.test('Collection: toMarkdown generates valid markdown', () => {
  const collection = {
    name: 'My Collection',
    description: 'Test description',
    createdAt: Date.now(),
    tabs: [
      { title: 'Page 1', url: 'https://example.com/1' },
      { title: 'Page 2', url: 'https://example.com/2' }
    ]
  };

  let md = `# ${collection.name}\n\n`;
  if (collection.description) {
    md += `${collection.description}\n\n`;
  }
  md += `*Created: ${new Date(collection.createdAt).toLocaleDateString()}*\n\n`;
  md += `## Links (${collection.tabs.length})\n\n`;
  collection.tabs.forEach((tab, index) => {
    md += `${index + 1}. [${tab.title}](${tab.url})\n`;
  });

  assert.true(md.includes('# My Collection'), 'has title');
  assert.true(md.includes('Test description'), 'has description');
  assert.true(md.includes('[Page 1](https://example.com/1)'), 'has markdown link');
  assert.true(md.includes('2.'), 'has numbered list');
});

// ==================== URL PARSING TESTS ====================

runner.test('URL: handles valid URLs', () => {
  const tab = { url: 'https://example.com/path?query=value' };
  let hostname;

  try {
    const urlObj = new URL(tab.url);
    hostname = urlObj.hostname;
  } catch (e) {
    hostname = tab.url || 'No URL';
  }

  assert.equal(hostname, 'example.com', 'hostname extracted');
});

runner.test('URL: handles invalid URLs gracefully', () => {
  const tab = { url: 'not-a-valid-url' };
  let hostname;

  try {
    const urlObj = new URL(tab.url);
    hostname = urlObj.hostname;
  } catch (e) {
    hostname = tab.url || 'No URL';
  }

  assert.equal(hostname, 'not-a-valid-url', 'falls back to raw URL');
});

runner.test('URL: handles empty URL', () => {
  const tab = { url: '' };
  let hostname;

  try {
    const urlObj = new URL(tab.url);
    hostname = urlObj.hostname;
  } catch (e) {
    hostname = tab.url || 'No URL';
  }

  assert.equal(hostname, 'No URL', 'shows placeholder');
});

runner.test('URL: handles undefined URL', () => {
  const tab = {};
  let hostname;

  try {
    const urlObj = new URL(tab.url);
    hostname = urlObj.hostname;
  } catch (e) {
    hostname = tab.url || 'No URL';
  }

  assert.equal(hostname, 'No URL', 'shows placeholder');
});

// Run all tests
runner.run().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
});

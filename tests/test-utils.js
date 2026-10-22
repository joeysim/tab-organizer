// Test Utilities for Tab Organizer Extension
// Provides mock objects and test helpers

// Mock Chrome API
const mockChrome = {
  tabs: {
    _tabs: [],
    query: async () => mockChrome.tabs._tabs,
    get: async (tabId) => mockChrome.tabs._tabs.find(t => t.id === tabId),
    create: async (options) => {
      const newTab = { id: Date.now(), ...options };
      mockChrome.tabs._tabs.push(newTab);
      return newTab;
    },
    remove: async (tabId) => {
      mockChrome.tabs._tabs = mockChrome.tabs._tabs.filter(t => t.id !== tabId);
    },
    group: async ({ tabIds }) => {
      const groupId = Date.now();
      tabIds.forEach(id => {
        const tab = mockChrome.tabs._tabs.find(t => t.id === id);
        if (tab) tab.groupId = groupId;
      });
      return groupId;
    },
    onCreated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    onUpdated: { addListener: () => {} }
  },
  tabGroups: {
    _groups: [],
    query: async () => mockChrome.tabGroups._groups,
    update: async (groupId, options) => {
      const group = mockChrome.tabGroups._groups.find(g => g.id === groupId);
      if (group) Object.assign(group, options);
      return group;
    },
    onCreated: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    onRemoved: { addListener: () => {} }
  },
  storage: {
    local: {
      _data: {},
      get: async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: mockChrome.storage.local._data[keys] };
        }
        const result = {};
        keys.forEach(k => {
          result[k] = mockChrome.storage.local._data[k];
        });
        return result;
      },
      set: async (data) => {
        Object.assign(mockChrome.storage.local._data, data);
      }
    },
    sync: {
      _data: {},
      get: async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: mockChrome.storage.sync._data[keys] };
        }
        const result = {};
        keys.forEach(k => {
          result[k] = mockChrome.storage.sync._data[k];
        });
        return result;
      },
      set: async (data) => {
        Object.assign(mockChrome.storage.sync._data, data);
      }
    }
  },
  runtime: {
    sendMessage: async (message) => {
      // Mock responses based on action
      switch (message.action) {
        case 'getTabs':
          return { success: true, tabs: mockChrome.tabs._tabs };
        case 'getGroups':
          return { success: true, groups: mockChrome.tabGroups._groups };
        case 'activateTab':
          return { success: true };
        case 'closeTab':
          await mockChrome.tabs.remove(message.tabId);
          return { success: true };
        case 'closeTabs':
          for (const id of message.tabIds) {
            await mockChrome.tabs.remove(id);
          }
          return { success: true };
        case 'createGroup':
          const groupId = await mockChrome.tabs.group({ tabIds: message.tabIds });
          mockChrome.tabGroups._groups.push({
            id: groupId,
            title: message.name,
            color: message.color,
            tabs: message.tabIds.map(id => ({ id }))
          });
          return { success: true, groupId };
        default:
          return { success: false, error: 'Unknown action' };
      }
    },
    getURL: (path) => `chrome-extension://test-id/${path}`
  }
};

// Reset all mocks
function resetMocks() {
  mockChrome.tabs._tabs = [];
  mockChrome.tabGroups._groups = [];
  mockChrome.storage.local._data = {};
  mockChrome.storage.sync._data = {};
}

// Create sample tabs for testing
function createSampleTabs(count = 5) {
  const tabs = [];
  for (let i = 0; i < count; i++) {
    tabs.push({
      id: i + 1,
      title: `Tab ${i + 1}`,
      url: `https://example${i + 1}.com/page`,
      favIconUrl: `https://example${i + 1}.com/favicon.ico`,
      groupId: -1
    });
  }
  return tabs;
}

// Create sample groups for testing
function createSampleGroups(tabs) {
  const grouped = tabs.slice(0, 2);
  const ungrouped = tabs.slice(2);

  return [
    {
      id: 100,
      title: 'Work',
      color: 'blue',
      tabs: grouped.map(t => ({ id: t.id }))
    },
    {
      id: -1,
      title: 'Ungrouped',
      color: 'grey',
      tabs: ungrouped.map(t => ({ id: t.id }))
    }
  ];
}

// Simple assertion helpers
const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
  },

  deepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message || 'Deep equality failed'}:
        expected ${JSON.stringify(expected)},
        got ${JSON.stringify(actual)}`);
    }
  },

  true(value, message) {
    if (!value) {
      throw new Error(message || 'Expected true but got falsy value');
    }
  },

  false(value, message) {
    if (value) {
      throw new Error(message || 'Expected false but got truthy value');
    }
  },

  throws(fn, message) {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (e) {
      // Success
    }
  }
};

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = { passed: 0, failed: 0, errors: [] };
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('Running tests...\n');

    for (const { name, fn } of this.tests) {
      try {
        resetMocks();
        await fn();
        this.results.passed++;
        console.log(`✓ ${name}`);
      } catch (error) {
        this.results.failed++;
        this.results.errors.push({ name, error: error.message });
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
      }
    }

    console.log(`\n${this.results.passed} passed, ${this.results.failed} failed`);
    return this.results;
  }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mockChrome, resetMocks, createSampleTabs, createSampleGroups, assert, TestRunner };
}

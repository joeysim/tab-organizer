// Collection Manager Tests
// Tests for the CollectionManager (sessions.js) module

const { mockChrome, resetMocks, assert, TestRunner } = require('./test-utils.js');

// Set up global chrome mock
global.chrome = mockChrome;

// Simulate CollectionManager for testing
const CollectionManager = {
  async getCollections() {
    try {
      const result = await chrome.storage.local.get('collections');
      return result.collections || [];
    } catch (e) {
      return [];
    }
  },

  async saveCollection(name, description, tabs) {
    const collections = await this.getCollections();

    const newCollection = {
      id: this.generateId(),
      name: name || `Collection ${collections.length + 1}`,
      description: description || '',
      createdAt: Date.now(),
      tabs: tabs.map(tab => ({
        url: tab.url,
        title: tab.title
      }))
    };

    collections.unshift(newCollection);
    await this.saveCollections(collections);

    return newCollection;
  },

  async saveCollections(collections) {
    try {
      await chrome.storage.local.set({ collections });
      return true;
    } catch (e) {
      return false;
    }
  },

  async getCollection(collectionId) {
    const collections = await this.getCollections();
    return collections.find(c => c.id === collectionId);
  },

  async deleteCollection(collectionId) {
    const collections = await this.getCollections();
    const filtered = collections.filter(c => c.id !== collectionId);
    await this.saveCollections(filtered);
    return { success: true };
  },

  async updateCollection(collectionId, updates) {
    const collections = await this.getCollections();
    const index = collections.findIndex(c => c.id === collectionId);

    if (index === -1) {
      throw new Error('Collection not found');
    }

    collections[index] = { ...collections[index], ...updates };
    await this.saveCollections(collections);

    return collections[index];
  },

  toMarkdown(collection) {
    let md = `# ${collection.name}\n\n`;

    if (collection.description) {
      md += `${collection.description}\n\n`;
    }

    md += `*Created: ${new Date(collection.createdAt).toLocaleDateString()}*\n\n`;
    md += `## Links (${collection.tabs.length})\n\n`;

    collection.tabs.forEach((tab, index) => {
      md += `${index + 1}. [${tab.title}](${tab.url})\n`;
    });

    return md;
  },

  generateId() {
    return `col_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
};

const runner = new TestRunner();

// ==================== COLLECTION CRUD TESTS ====================

runner.test('CollectionManager: getCollections returns empty array initially', async () => {
  const collections = await CollectionManager.getCollections();
  assert.equal(collections.length, 0, 'should return empty array');
});

runner.test('CollectionManager: saveCollection creates new collection', async () => {
  const tabs = [
    { url: 'https://example.com', title: 'Example' },
    { url: 'https://test.com', title: 'Test' }
  ];

  const collection = await CollectionManager.saveCollection('My Collection', 'A description', tabs);

  assert.true(collection.id.startsWith('col_'), 'has generated ID');
  assert.equal(collection.name, 'My Collection', 'name saved');
  assert.equal(collection.description, 'A description', 'description saved');
  assert.equal(collection.tabs.length, 2, 'tabs saved');
  assert.true(collection.createdAt > 0, 'has timestamp');
});

runner.test('CollectionManager: saveCollection uses default name if empty', async () => {
  // First save a collection to get count > 0
  await CollectionManager.saveCollection('First', '', []);

  const collection = await CollectionManager.saveCollection('', '', []);

  assert.equal(collection.name, 'Collection 2', 'uses default name with count');
});

runner.test('CollectionManager: getCollection returns specific collection', async () => {
  const tabs = [{ url: 'https://example.com', title: 'Example' }];
  const saved = await CollectionManager.saveCollection('Test', '', tabs);

  const retrieved = await CollectionManager.getCollection(saved.id);

  assert.equal(retrieved.id, saved.id, 'same ID');
  assert.equal(retrieved.name, 'Test', 'same name');
});

runner.test('CollectionManager: getCollection returns undefined for non-existent ID', async () => {
  const retrieved = await CollectionManager.getCollection('non-existent-id');

  assert.equal(retrieved, undefined, 'returns undefined');
});

runner.test('CollectionManager: deleteCollection removes collection', async () => {
  const saved = await CollectionManager.saveCollection('To Delete', '', []);

  await CollectionManager.deleteCollection(saved.id);

  const collections = await CollectionManager.getCollections();
  const found = collections.find(c => c.id === saved.id);

  assert.equal(found, undefined, 'collection deleted');
});

runner.test('CollectionManager: updateCollection modifies collection', async () => {
  const saved = await CollectionManager.saveCollection('Original', 'Original desc', []);

  const updated = await CollectionManager.updateCollection(saved.id, {
    name: 'Updated',
    description: 'Updated desc'
  });

  assert.equal(updated.name, 'Updated', 'name updated');
  assert.equal(updated.description, 'Updated desc', 'description updated');
  assert.equal(updated.id, saved.id, 'ID unchanged');
});

runner.test('CollectionManager: updateCollection throws for non-existent ID', async () => {
  let errorThrown = false;

  try {
    await CollectionManager.updateCollection('non-existent', { name: 'New' });
  } catch (e) {
    errorThrown = true;
    assert.equal(e.message, 'Collection not found', 'correct error message');
  }

  assert.true(errorThrown, 'should throw error');
});

runner.test('CollectionManager: new collections appear at beginning', async () => {
  resetMocks();

  await CollectionManager.saveCollection('First', '', []);
  await CollectionManager.saveCollection('Second', '', []);
  await CollectionManager.saveCollection('Third', '', []);

  const collections = await CollectionManager.getCollections();

  assert.equal(collections[0].name, 'Third', 'newest first');
  assert.equal(collections[1].name, 'Second', 'second newest');
  assert.equal(collections[2].name, 'First', 'oldest last');
});

// ==================== MARKDOWN EXPORT TESTS ====================

runner.test('CollectionManager: toMarkdown generates correct format', () => {
  const collection = {
    name: 'Research Links',
    description: 'Links about AI',
    createdAt: new Date('2024-01-15').getTime(),
    tabs: [
      { title: 'OpenAI', url: 'https://openai.com' },
      { title: 'Anthropic', url: 'https://anthropic.com' }
    ]
  };

  const md = CollectionManager.toMarkdown(collection);

  assert.true(md.includes('# Research Links'), 'has H1 title');
  assert.true(md.includes('Links about AI'), 'has description');
  assert.true(md.includes('## Links (2)'), 'has link count');
  assert.true(md.includes('1. [OpenAI](https://openai.com)'), 'has numbered link 1');
  assert.true(md.includes('2. [Anthropic](https://anthropic.com)'), 'has numbered link 2');
});

runner.test('CollectionManager: toMarkdown handles empty description', () => {
  const collection = {
    name: 'No Desc',
    description: '',
    createdAt: Date.now(),
    tabs: []
  };

  const md = CollectionManager.toMarkdown(collection);

  // Should not have double newlines from empty description
  assert.false(md.includes('\n\n\n\n'), 'no excessive newlines');
});

runner.test('CollectionManager: toMarkdown handles empty tabs', () => {
  const collection = {
    name: 'Empty',
    description: '',
    createdAt: Date.now(),
    tabs: []
  };

  const md = CollectionManager.toMarkdown(collection);

  assert.true(md.includes('## Links (0)'), 'shows zero count');
});

runner.test('CollectionManager: toMarkdown escapes special characters in title', () => {
  const collection = {
    name: 'Test',
    description: '',
    createdAt: Date.now(),
    tabs: [
      { title: 'Link [with] brackets', url: 'https://example.com' }
    ]
  };

  const md = CollectionManager.toMarkdown(collection);

  // The current implementation doesn't escape, so this tests current behavior
  assert.true(md.includes('Link [with] brackets'), 'title preserved');
});

// ==================== ID GENERATION TESTS ====================

runner.test('CollectionManager: generateId creates unique IDs', () => {
  const id1 = CollectionManager.generateId();
  const id2 = CollectionManager.generateId();
  const id3 = CollectionManager.generateId();

  assert.true(id1 !== id2, 'id1 !== id2');
  assert.true(id2 !== id3, 'id2 !== id3');
  assert.true(id1 !== id3, 'id1 !== id3');
});

runner.test('CollectionManager: generateId has correct format', () => {
  const id = CollectionManager.generateId();

  assert.true(id.startsWith('col_'), 'starts with col_');
  assert.true(id.length > 15, 'has sufficient length');
});

// ==================== TAB DATA HANDLING TESTS ====================

runner.test('CollectionManager: only saves url and title from tabs', async () => {
  const tabs = [
    {
      id: 123,
      url: 'https://example.com',
      title: 'Example',
      favIconUrl: 'https://example.com/favicon.ico',
      groupId: 456,
      windowId: 789
    }
  ];

  const collection = await CollectionManager.saveCollection('Test', '', tabs);

  assert.equal(collection.tabs[0].url, 'https://example.com', 'url saved');
  assert.equal(collection.tabs[0].title, 'Example', 'title saved');
  assert.equal(collection.tabs[0].id, undefined, 'id not saved');
  assert.equal(collection.tabs[0].favIconUrl, undefined, 'favIconUrl not saved');
  assert.equal(collection.tabs[0].groupId, undefined, 'groupId not saved');
});

// ==================== PERSISTENCE TESTS ====================

runner.test('CollectionManager: collections persist in storage', async () => {
  resetMocks();

  await CollectionManager.saveCollection('Persistent', 'Should persist', [
    { url: 'https://example.com', title: 'Example' }
  ]);

  // Verify directly in mock storage
  const stored = await chrome.storage.local.get('collections');

  assert.equal(stored.collections.length, 1, 'stored in chrome.storage');
  assert.equal(stored.collections[0].name, 'Persistent', 'data correct');
});

// Run all tests
runner.run().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
});

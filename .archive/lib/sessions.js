// Collection Manager for saving and managing tab collections

const CollectionManager = {
  // Get all collections
  async getCollections() {
    try {
      const result = await chrome.storage.local.get(['collections']);
      return result.collections || [];
    } catch (e) {
      console.error('Failed to get collections:', e);
      return [];
    }
  },

  // Save a new collection
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

  // Save collections array
  async saveCollections(collections) {
    try {
      await chrome.storage.local.set({ collections });
      return true;
    } catch (e) {
      console.error('Failed to save collections:', e);
      return false;
    }
  },

  // Get a single collection by ID
  async getCollection(collectionId) {
    const collections = await this.getCollections();
    return collections.find(c => c.id === collectionId);
  },

  // Delete a collection
  async deleteCollection(collectionId) {
    const collections = await this.getCollections();
    const filtered = collections.filter(c => c.id !== collectionId);
    await this.saveCollections(filtered);
    return { success: true };
  },

  // Update collection
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

  // Add a tab/URL to an existing collection
  async addToCollection(collectionId, tab) {
    const collections = await this.getCollections();
    const index = collections.findIndex(c => c.id === collectionId);

    if (index === -1) {
      throw new Error('Collection not found');
    }

    // Add the new tab (only url and title)
    collections[index].tabs.push({
      url: tab.url,
      title: tab.title
    });

    await this.saveCollections(collections);
    return collections[index];
  },

  // Add multiple tabs to an existing collection
  async addTabsToCollection(collectionId, tabs) {
    const collections = await this.getCollections();
    const index = collections.findIndex(c => c.id === collectionId);

    if (index === -1) {
      throw new Error('Collection not found');
    }

    // Add the new tabs (only url and title)
    tabs.forEach(tab => {
      collections[index].tabs.push({
        url: tab.url,
        title: tab.title
      });
    });

    await this.saveCollections(collections);
    return collections[index];
  },

  // Reopen all tabs in a collection as a new group
  async reopenCollection(collectionId) {
    const collection = await this.getCollection(collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    const tabIds = [];
    for (const tab of collection.tabs) {
      const newTab = await chrome.tabs.create({ url: tab.url, active: false });
      tabIds.push(newTab.id);
    }

    // Create a group with the collection name
    if (tabIds.length > 0) {
      const groupId = await chrome.tabs.group({ tabIds });
      const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      await chrome.tabGroups.update(groupId, {
        title: collection.name,
        color: randomColor
      });
    }

    return { success: true, tabsOpened: collection.tabs.length };
  },

  // Convert collection to Markdown
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

  // Download collection as Markdown file
  downloadAsMarkdown(collection) {
    const md = this.toMarkdown(collection);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const safeName = collection.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Copy collection to clipboard as formatted text
  async copyToClipboard(collection) {
    const md = this.toMarkdown(collection);
    await navigator.clipboard.writeText(md);
    return { success: true };
  },

  // Convert all collections to Markdown
  async allToMarkdown() {
    const collections = await this.getCollections();
    if (collections.length === 0) {
      return '# My Collections\n\nNo collections saved yet.\n';
    }

    let md = '# My Collections\n\n';
    md += `*Exported: ${new Date().toLocaleDateString()}*\n\n`;
    md += `---\n\n`;

    collections.forEach((collection, idx) => {
      md += `## ${idx + 1}. ${collection.name}\n\n`;

      if (collection.description) {
        md += `${collection.description}\n\n`;
      }

      md += `*Created: ${new Date(collection.createdAt).toLocaleDateString()}*\n\n`;
      md += `### Links (${collection.tabs.length})\n\n`;

      collection.tabs.forEach((tab, tabIdx) => {
        md += `${tabIdx + 1}. [${tab.title}](${tab.url})\n`;
      });

      md += `\n---\n\n`;
    });

    return md;
  },

  // Download all collections as Markdown file
  async downloadAllAsMarkdown() {
    const md = await this.allToMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `all-collections-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Copy all collections to clipboard
  async copyAllToClipboard() {
    const md = await this.allToMarkdown();
    await navigator.clipboard.writeText(md);
    return { success: true };
  },

  // Generate unique ID
  generateId() {
    return `col_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
};

// Keep SessionManager as alias for backwards compatibility
const SessionManager = CollectionManager;

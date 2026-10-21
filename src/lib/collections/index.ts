import { Storage } from '../../shared/storage/index.js';
import type { Collection } from '../../shared/types/index.js';

async function getCollections(): Promise<Collection[]> {
  return Storage.getCollections();
}

async function saveCollections(collections: Collection[]): Promise<boolean> {
  return Storage.saveCollections(collections);
}

async function getCollection(collectionId: string): Promise<Collection | undefined> {
  const collections = await getCollections();
  return collections.find((c) => c.id === collectionId);
}

async function saveCollection(
  name: string,
  description: string,
  tabs: Array<{ url: string; title: string }>,
): Promise<Collection> {
  const collections = await getCollections();

  const newCollection: Collection = {
    id: generateId(),
    name: name || `Collection ${collections.length + 1}`,
    description: description || '',
    createdAt: Date.now(),
    tabs: tabs.map((tab) => ({
      url: tab.url,
      title: tab.title,
    })),
  };

  collections.unshift(newCollection);
  await saveCollections(collections);

  return newCollection;
}

async function deleteCollection(collectionId: string): Promise<{ success: boolean }> {
  const collections = await getCollections();
  const filtered = collections.filter((c) => c.id !== collectionId);
  await saveCollections(filtered);
  return { success: true };
}

async function updateCollection(
  collectionId: string,
  updates: Partial<Collection>,
): Promise<Collection> {
  const collections = await getCollections();
  const index = collections.findIndex((c) => c.id === collectionId);

  if (index === -1) {
    throw new Error('Collection not found');
  }

  collections[index] = { ...collections[index], ...updates };
  await saveCollections(collections);

  return collections[index];
}

async function addToCollection(
  collectionId: string,
  tab: { url: string; title: string },
): Promise<Collection> {
  const collections = await getCollections();
  const index = collections.findIndex((c) => c.id === collectionId);

  if (index === -1) {
    throw new Error('Collection not found');
  }

  collections[index].tabs.push({
    url: tab.url,
    title: tab.title,
  });

  await saveCollections(collections);
  return collections[index];
}

async function addTabsToCollection(
  collectionId: string,
  tabs: Array<{ url: string; title: string }>,
): Promise<Collection> {
  const collections = await getCollections();
  const index = collections.findIndex((c) => c.id === collectionId);

  if (index === -1) {
    throw new Error('Collection not found');
  }

  tabs.forEach((tab) => {
    collections[index].tabs.push({
      url: tab.url,
      title: tab.title,
    });
  });

  await saveCollections(collections);
  return collections[index];
}

function toMarkdown(collection: Collection): string {
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
}

function downloadAsMarkdown(collection: Collection): void {
  const md = toMarkdown(collection);
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
}

async function copyToClipboard(collection: Collection): Promise<{ success: boolean }> {
  const md = toMarkdown(collection);
  await navigator.clipboard.writeText(md);
  return { success: true };
}

async function allToMarkdown(): Promise<string> {
  const collections = await getCollections();
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
}

async function downloadAllAsMarkdown(): Promise<void> {
  const md = await allToMarkdown();
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
}

async function copyAllToClipboard(): Promise<{ success: boolean }> {
  const md = await allToMarkdown();
  await navigator.clipboard.writeText(md);
  return { success: true };
}

function generateId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export const CollectionManager = {
  getCollections,
  saveCollection,
  saveCollections,
  getCollection,
  deleteCollection,
  updateCollection,
  addToCollection,
  addTabsToCollection,
  toMarkdown,
  downloadAsMarkdown,
  copyToClipboard,
  allToMarkdown,
  downloadAllAsMarkdown,
  copyAllToClipboard,
  generateId,
};

export const SessionManager = CollectionManager;

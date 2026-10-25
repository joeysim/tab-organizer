import { Storage } from '../shared/storage/index.js';

export async function reopenCollection(collectionId: string) {
  const collection = await Storage.getCollection(collectionId);
  if (!collection) {
    throw new Error('Collection not found');
  }

  const tabIds: number[] = [];
  for (const tab of collection.tabs) {
    const newTab = await chrome.tabs.create({ url: tab.url, active: false });
    tabIds.push(newTab.id!);
  }

  // Create a group with the collection name
  if (tabIds.length > 0) {
    const groupId = await chrome.tabs.group({ tabIds });
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    await (chrome.tabGroups.update as unknown as (id: number, p: { title: string; color: string }) => Promise<void>)(groupId, {
      title: collection.name,
      color: randomColor,
    });
  }

  return { success: true, tabsOpened: collection.tabs.length };
}

/** Re-open tabs that were closed by an approved AI action (undo). */
export async function reopenTabs(tabs: Array<{ url: string; title?: string }>) {
  const ids: number[] = [];
  for (const tab of tabs) {
    try {
      const created = await chrome.tabs.create({ url: tab.url, active: false });
      if (created.id !== undefined) ids.push(created.id);
    } catch {
      // skip URLs the browser refuses (revoked, unsupported scheme)
    }
  }
  return { success: true, reopened: ids.length, tabIds: ids };
}

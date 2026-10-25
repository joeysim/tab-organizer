import { listAllTabs, getTabGroups } from './tabs.js';
import { createTabGroup, moveTabsToGroup, ungroupTabs, updateTabGroup, deleteTabGroup } from './groups.js';
import { getTabContent, getAllTabsContent } from './content/batch.js';
import { reopenCollection, reopenTabs } from './collections.js';

export async function handleMessage(message: Record<string, unknown>) {
  const { action, tabId, tabIds, groupId, name, color, collectionId } = message as {
    action: string;
    tabId?: number;
    tabIds?: number[];
    groupId?: number;
    name?: string;
    color?: string;
    collectionId?: string;
  };

  switch (action) {
    case 'getTabs':
      return await listAllTabs();

    case 'getContent':
      return await getTabContent(tabId!);

    case 'getAllContent':
      return await getAllTabsContent();

    case 'getGroups':
      return await getTabGroups();

    case 'activateTab':
      await chrome.tabs.update(tabId!, { active: true });
      const tab = await chrome.tabs.get(tabId!);
      await chrome.windows.update(tab.windowId, { focused: true });
      return { success: true };

    case 'closeTab':
      await chrome.tabs.remove(tabId!);
      return { success: true };

    case 'closeTabs':
      await chrome.tabs.remove(tabIds!);
      return { success: true };

    case 'createGroup':
      return await createTabGroup(name!, tabIds!, color);

    case 'moveToGroup':
      return await moveTabsToGroup(tabIds!, groupId!);

    case 'addTabsToGroup':
      return await moveTabsToGroup(tabIds!, groupId!);

    case 'updateGroupColor':
      return await updateTabGroup(groupId!, { color });

    case 'ungroup':
      return await ungroupTabs(tabIds!);

    case 'updateGroup':
      return await updateTabGroup(groupId!, { title: name, color });

    case 'deleteGroup':
      return await deleteTabGroup(groupId!);

    case 'reopenCollection':
      return await reopenCollection(collectionId as string);

    case 'reopenTabs':
      return await reopenTabs((message.tabs as Array<{ url: string; title?: string }>) ?? []);

    default:
      return { error: `Unknown action: ${action}` };
  }
}

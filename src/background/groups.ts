export async function createTabGroup(name: string, tabIds: number[], color: string = 'blue') {
  try {
    if (!tabIds || tabIds.length === 0) {
      return { error: 'No tabs provided' };
    }
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: name, color: color as chrome.tabGroups.Color });
    return { success: true, groupId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function moveTabsToGroup(tabIds: number[], groupId: number) {
  try {
    await chrome.tabs.group({ tabIds, groupId });
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function ungroupTabs(tabIds: number[]) {
  try {
    await chrome.tabs.ungroup(tabIds);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateTabGroup(groupId: number, options: { title?: string; color?: string }) {
  try {
    await chrome.tabGroups.update(groupId, options as chrome.tabGroups.UpdateProperties);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteTabGroup(groupId: number) {
  try {
    // Ungroup all tabs in the group (effectively deleting the group)
    const tabs = await chrome.tabs.query({ groupId });
    if (tabs.length > 0) {
      await chrome.tabs.ungroup(tabs.map((t) => t.id!));
    }
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

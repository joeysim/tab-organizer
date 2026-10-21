export async function getGroupsMap(): Promise<Map<number, { title: string; color: string }>> {
  try {
    const groups = await chrome.tabGroups.query({});
    return new Map(groups.map((g) => [g.id, { title: g.title, color: g.color }]));
  } catch (e) {
    return new Map();
  }
}

export async function listAllTabs() {
  const tabs = await chrome.tabs.query({});
  const groups = await getGroupsMap();

  return {
    success: true,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      groupId: tab.groupId,
      groupName: groups.get(tab.groupId!)?.title || null,
      groupColor: groups.get(tab.groupId!)?.color || null,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned
    }))
  };
}

export async function getTabGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    const tabs = await chrome.tabs.query({});

    const groupedTabs: Record<number, { id: number; title: string; color: string | null; collapsed: boolean; tabs: Array<{ id: number; url: string; title: string; favIconUrl?: string }> }> = {};
    for (const group of groups) {
      groupedTabs[group.id] = {
        id: group.id,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        tabs: []
      };
    }

    // Ungrouped tabs
    groupedTabs[-1] = {
      id: -1,
      title: 'Ungrouped',
      color: null,
      collapsed: false,
      tabs: []
    };

    for (const tab of tabs) {
      const groupId = tab.groupId !== undefined && tab.groupId !== -1 ? tab.groupId : -1;
      const targetGroup = groupedTabs[groupId] || groupedTabs[-1];
      targetGroup.tabs.push({
        id: tab.id!,
        url: tab.url!,
        title: tab.title!,
        favIconUrl: tab.favIconUrl
      });
    }

    return {
      success: true,
      groups: Object.values(groupedTabs).filter((g) => g.tabs.length > 0)
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

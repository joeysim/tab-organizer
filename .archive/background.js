// Tab Organizer Dashboard - Background Service Worker
// Handles tab operations and content extraction for the dashboard

// Open dashboard when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
});

// Message handler for newtab page requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  const { action, tabId, tabIds, groupId, name, color } = message;

  switch (action) {
    case 'getTabs':
      return await listAllTabs();

    case 'getContent':
      return await getTabContent(tabId);

    case 'getAllContent':
      return await getAllTabsContent();

    case 'getGroups':
      return await getTabGroups();

    case 'activateTab':
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      return { success: true };

    case 'closeTab':
      await chrome.tabs.remove(tabId);
      return { success: true };

    case 'closeTabs':
      await chrome.tabs.remove(tabIds);
      return { success: true };

    case 'createGroup':
      return await createTabGroup(name, tabIds, color);

    case 'moveToGroup':
      return await moveTabsToGroup(tabIds, groupId);

    case 'addTabsToGroup':
      return await moveTabsToGroup(tabIds, groupId);

    case 'updateGroupColor':
      return await updateTabGroup(groupId, { color });

    case 'ungroup':
      return await ungroupTabs(tabIds);

    case 'updateGroup':
      return await updateTabGroup(groupId, { title: name, color });

    case 'deleteGroup':
      return await deleteTabGroup(groupId);

    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function listAllTabs() {
  const tabs = await chrome.tabs.query({});
  const groups = await getGroupsMap();

  return {
    success: true,
    tabs: tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      groupId: tab.groupId,
      groupName: groups.get(tab.groupId)?.title || null,
      groupColor: groups.get(tab.groupId)?.color || null,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned
    }))
  };
}

async function getGroupsMap() {
  try {
    const groups = await chrome.tabGroups.query({});
    return new Map(groups.map(g => [g.id, { title: g.title, color: g.color }]));
  } catch (e) {
    return new Map();
  }
}

async function getTabGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    const tabs = await chrome.tabs.query({});

    const groupedTabs = {};
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
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      });
    }

    return {
      success: true,
      groups: Object.values(groupedTabs).filter(g => g.tabs.length > 0)
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function createTabGroup(name, tabIds, color = 'blue') {
  try {
    if (!tabIds || tabIds.length === 0) {
      return { error: 'No tabs provided' };
    }
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: name, color });
    return { success: true, groupId };
  } catch (e) {
    return { error: e.message };
  }
}

async function moveTabsToGroup(tabIds, groupId) {
  try {
    await chrome.tabs.group({ tabIds, groupId });
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function ungroupTabs(tabIds) {
  try {
    await chrome.tabs.ungroup(tabIds);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function updateTabGroup(groupId, options) {
  try {
    await chrome.tabGroups.update(groupId, options);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function deleteTabGroup(groupId) {
  try {
    // Ungroup all tabs in the group (effectively deleting the group)
    const tabs = await chrome.tabs.query({ groupId });
    if (tabs.length > 0) {
      await chrome.tabs.ungroup(tabs.map(t => t.id));
    }
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function getTabContent(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    // Skip restricted URLs
    if (!tab.url ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('brave://') ||
        tab.url.startsWith('file://')) {
      return {
        success: false,
        error: 'Cannot access restricted page',
        tabId,
        url: tab.url,
        title: tab.title
      };
    }

    // Execute content extraction
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent
    });

    return {
      success: true,
      tabId,
      url: tab.url,
      title: tab.title,
      content: results[0]?.result || ''
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabId
    };
  }
}

// Content extraction function to be injected
function extractPageContent() {
  const skipTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG',
    'PATH', 'CANVAS', 'VIDEO', 'AUDIO', 'IMG'
  ]);

  const skipSelectors = [
    'nav', 'footer', 'header', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header',
    '.advertisement', '.ad', '.ads', '.cookie', '.popup', '.modal',
    '#nav', '#navigation', '#menu', '#sidebar', '#footer', '#header'
  ];

  function shouldSkip(el) {
    if (skipTags.has(el.tagName)) return true;

    try {
      for (const selector of skipSelectors) {
        if (el.matches && el.matches(selector)) return true;
      }
    } catch (e) {}

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;

    return false;
  }

  function extract(el, depth = 0) {
    if (depth > 30 || shouldSkip(el)) return '';

    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) text += t + ' ';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        text += extract(child, depth + 1);
      }
    }
    return text;
  }

  // Try to find main content area first
  const mainContent = document.querySelector('main, article, [role="main"], .main-content, #main-content, #content, .content');
  const target = mainContent || document.body;

  let content = extract(target);

  // Clean up whitespace and truncate
  content = content.replace(/\s+/g, ' ').trim();

  // Truncate to ~50KB
  if (content.length > 50000) {
    content = content.substring(0, 50000) + '... [truncated]';
  }

  return content;
}

async function getAllTabsContent() {
  const tabs = await chrome.tabs.query({});
  const results = [];

  // Process tabs in parallel with a concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
    const batch = tabs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(tab => getTabContent(tab.id))
    );
    results.push(...batchResults);
  }

  return {
    success: true,
    tabs: results
  };
}

console.log('[TabOrganizer] Tab Organizer Dashboard extension loaded');

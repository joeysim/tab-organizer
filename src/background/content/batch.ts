import { BATCH_SIZE } from '../../shared/constants/index.js';
import { isRestricted } from './policy.js';

// Content extraction function to be injected — must stay self-contained
// shortcut: duplicated from extract.raw.ts — keep in sync; verify-build asserts dist contains extractPageContent, upgrade to single-source build inline when needed
function extractPageContent(): string {
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

  function shouldSkip(el: Element): boolean {
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

  function extract(el: Element, depth = 0): string {
    if (depth > 30 || shouldSkip(el)) return '';

    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent || '').trim();
        if (t) text += t + ' ';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        text += extract(child as Element, depth + 1);
      }
    }
    return text;
  }

  // Try to find main content area first
  const mainContent = document.querySelector('main, article, [role="main"], .main-content, #main-content, #content, .content');
  const target = mainContent || document.body;

  let content = extract(target as Element);

  // Clean up whitespace and truncate
  content = content.replace(/\s+/g, ' ').trim();

  // Truncate to ~50KB
  if (content.length > 50000) {
    content = content.substring(0, 50000) + '... [truncated]';
  }

  return content;
}

export async function getTabContent(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);

    // Skip restricted URLs
    if (isRestricted(tab.url || '')) {
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
      content: (results as unknown as Array<{ result: string }>)[0]?.result || ''
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      tabId
    };
  }
}

export async function getAllTabsContent() {
  const tabs = await chrome.tabs.query({});
  const results: unknown[] = [];

  // Process tabs in parallel with a concurrency limit
  for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
    const batch = tabs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((tab) => getTabContent(tab.id!))
    );
    results.push(...batchResults);
  }

  return {
    success: true,
    tabs: results
  };
}

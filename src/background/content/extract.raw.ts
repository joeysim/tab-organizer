// @no-bundle — passed directly to chrome.scripting.executeScript, must stay self-contained
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

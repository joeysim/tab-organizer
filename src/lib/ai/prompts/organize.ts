import type { TabInput } from '../provider.js';

/** hostname + first two path segments — keeps github.com/org/repo, drops query noise. */
function compactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
    return path ? `${u.hostname}/${path}` : u.hostname;
  } catch {
    return raw.slice(0, 60);
  }
}

export function buildPrompt(tabs: TabInput[]): string {
  const tabList = tabs.map((t) => `[ID:${t.id}] ${t.title} | ${compactUrl(t.url)}`).join('\n');

  return `Group these browser tabs by topic or project. Every group needs 2+ tabs; leave unrelated tabs out.
Names: 2-4 words. Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.

Reply with JSON only, using the exact IDs above:
{"groups":[{"name":"Group Name","color":"blue","tabIds":[1,2]}]}

${tabList}`;
}

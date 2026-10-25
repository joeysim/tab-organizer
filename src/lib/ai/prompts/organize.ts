import type { TabInput } from '../provider.js';

/** hostname + path — repo/issue/thread identity lives in the path. */
function compactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return raw.slice(0, 80);
  }
}

export function buildPrompt(tabs: TabInput[]): string {
  const tabList = tabs.map((t) => `[ID:${t.id}] ${t.title} | ${compactUrl(t.url)}`).join('\n');

  return `You group a person's browser tabs the way a thoughtful assistant would.

TABS
${tabList}

HOW TO GROUP
- Group by what the person is WORKING ON: a project, a decision, a task, a thing being researched.
- Do NOT group by website. The same site can belong to several groups, and one group can span many sites.
- Two GitHub tabs about different projects belong apart. Same for Linear, Figma, Gmail, Notion.
- The repository name, issue key, project name, or thread subject in the title tells you what the work is. The domain does not.
- Name the group after the work, not the site. "Billing webhook retries" is good; "GitHub" or "Email" is not.
- 2+ tabs per group. Leave genuinely unrelated tabs out rather than inventing a "Misc" group.

Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.

Reply with JSON only:
{"groups":[{"name":"Billing webhook retries","color":"blue","why":"Stripe docs, the Stripe dashboard, and the billing-service issue are all about retry failures","tabIds":[4,5,6,8]}]}`;
}

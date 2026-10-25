import type { PlanTab } from '../tools.js';
import { buildInventory, catalogForPrompt } from '../tools.js';

/**
 * One-shot planning prompt. We deliberately do NOT run a tool loop: the model
 * gets the whole inventory, returns a plan, and the user approves it. That keeps
 * one round trip, makes validation deterministic, and gives us a preview before
 * anything destructive happens.
 */
export function buildPlanPrompt(request: string, tabs: PlanTab[]): string {
  return `You turn a user's request about their browser tabs into a plan of tool calls.

TOOLS
${catalogForPrompt()}

TARGETING — every action needs "select", one of:
{"ids":[1,2,3]}            exact tabs
{"host":"mail.google.com"}  all tabs on that host (subdomains included)
{"urlContains":"github.com/pulls"}
{"titleContains":"inbox"}
{"ungrouped":true}         tabs not in any group
{"pinned":true}
{"all":true}               every tab

RULES
- Use the fewest actions that satisfy the request.
- Never select a tab unless it matches what the user asked for.
- Closing tabs is destructive; do it only when asked.
- If the request cannot be done with these tools, return {"actions":[]} and explain in "summary".

OPEN TABS
${buildInventory(tabs)}

REQUEST
${request}

Reply with JSON only:
{"summary":"one line describing what you will do","actions":[{"tool":"closeTabs","select":{"host":"mail.google.com"},"reason":"gmail tabs"}]}`;
}

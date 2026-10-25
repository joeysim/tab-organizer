/**
 * tools.ts — the capability catalog the AI plans against, plus selector
 * resolution and plan validation. Pure: no chrome.* calls, no DOM.
 *
 * A plan is a list of actions. Each action targets tabs by *selector* rather
 * than an explicit id list, so plans stay short and open-ended ("all gmail
 * tabs") instead of enumerating ids. We resolve selectors against the live tab
 * list before anything is shown or executed, so the preview is always concrete.
 */

export const TAB_GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

/** The minimum a tab needs for planning/resolution. Mirrors the dashboard Tab. */
export type PlanTab = {
  id: number;
  title: string;
  url: string;
  groupId: number;
  groupName?: string | null;
  pinned?: boolean;
};

export type TabSelector =
  | { ids: number[] }
  | { host: string }
  | { urlContains: string }
  | { titleContains: string }
  | { ungrouped: true }
  | { group: string }
  | { pinned: true }
  | { all: true };

export type ToolName =
  | 'closeTabs'
  | 'createGroup'
  | 'moveToGroup'
  | 'ungroupTabs'
  | 'saveCollection'
  | 'activateTab';

export type Action = {
  tool: ToolName;
  select: TabSelector;
  /** createGroup / saveCollection */
  name?: string;
  /** createGroup */
  color?: TabGroupColor;
  /** moveToGroup: existing group title */
  group?: string;
  reason?: string;
};

export type Plan = {
  summary?: string;
  actions: Action[];
};

/** Destructive actions get a warning treatment in the preview. */
export const DESTRUCTIVE_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>(['closeTabs']);

export type ToolSpec = {
  name: ToolName;
  description: string;
  destructive?: boolean;
};

export const TOOL_CATALOG: readonly ToolSpec[] = [
  {
    name: 'closeTabs',
    description: 'Close tabs. Destructive: the user can undo immediately afterwards.',
    destructive: true,
  },
  {
    name: 'createGroup',
    description: 'Create a new tab group containing tabs. Needs "name" and optional "color".',
  },
  {
    name: 'moveToGroup',
    description: 'Move tabs into an existing group by its title ("group").',
  },
  {
    name: 'ungroupTabs',
    description: 'Remove tabs from their current group, leaving them ungrouped.',
  },
  {
    name: 'saveCollection',
    description: 'Save tabs as a named collection of links. Needs "name".',
  },
  {
    name: 'activateTab',
    description: 'Focus a single tab and bring its window to front.',
  },
];

/** Human-readable line for the preview, per action shape. */
export function describeAction(action: Action, count: number): string {
  const n = `${count} tab${count === 1 ? '' : 's'}`;
  switch (action.tool) {
    case 'closeTabs':
      return `Close ${n}`;
    case 'createGroup':
      return `Group ${n} as “${action.name || 'Group'}”`;
    case 'moveToGroup':
      return `Move ${n} into “${action.group || 'group'}”`;
    case 'ungroupTabs':
      return `Ungroup ${n}`;
    case 'saveCollection':
      return `Save ${n} to collection “${action.name || 'Collection'}”`;
    case 'activateTab':
      return `Focus ${n}`;
    default:
      return `Unknown action on ${n}`;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Resolve a selector to concrete tabs. Unknown/empty selectors resolve to []
 * rather than "everything", so a malformed plan can never become a mass action.
 */
export function resolveSelector(selector: unknown, tabs: PlanTab[]): PlanTab[] {
  if (!selector || typeof selector !== 'object') return [];
  const s = selector as Record<string, unknown>;

  if (Array.isArray(s.ids)) {
    const ids = new Set(s.ids.map(Number).filter((n) => Number.isFinite(n)));
    return tabs.filter((t) => ids.has(t.id));
  }
  if (typeof s.host === 'string' && s.host.trim()) {
    const want = s.host.trim().toLowerCase().replace(/^www\./i, '');
    return tabs.filter((t) => {
      const h = hostOf(t.url);
      return h === want || h.endsWith(`.${want}`);
    });
  }
  if (typeof s.urlContains === 'string' && s.urlContains.trim()) {
    const q = s.urlContains.trim().toLowerCase();
    return tabs.filter((t) => t.url.toLowerCase().includes(q));
  }
  if (typeof s.titleContains === 'string' && s.titleContains.trim()) {
    const q = s.titleContains.trim().toLowerCase();
    return tabs.filter((t) => (t.title || '').toLowerCase().includes(q));
  }
  if (s.ungrouped === true) return tabs.filter((t) => t.groupId === -1);
  if (typeof s.group === 'string' && s.group.trim()) {
    const want = s.group.trim().toLowerCase();
    return tabs.filter((t) => t.groupId !== -1 && (t.groupName || '').toLowerCase() === want);
  }
  if (s.pinned === true) return tabs.filter((t) => t.pinned === true);
  if (s.all === true) return [...tabs];
  return [];
}

export type ResolvedAction = {
  action: Action;
  tabs: PlanTab[];
  description: string;
  destructive: boolean;
};

export type ResolvedPlan = {
  summary: string;
  actions: ResolvedAction[];
  /** Actions dropped during validation, for transparency in the UI. */
  skipped: string[];
};

function normalizeColor(color: unknown): TabGroupColor {
  const c = String(color ?? '').toLowerCase().trim();
  return (TAB_GROUP_COLORS as readonly string[]).includes(c) ? (c as TabGroupColor) : 'blue';
}

/** Same id may appear in several actions; later actions see the live state. */
function uniqueTabs(tabs: PlanTab[]): PlanTab[] {
  const seen = new Set<number>();
  return tabs.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

/**
 * Validate a raw model response into an executable plan.
 * Anything unrecognized is dropped and reported, never guessed at.
 */
export function validatePlan(raw: unknown, tabs: PlanTab[]): ResolvedPlan {
  const skipped: string[] = [];
  const plan = (raw ?? {}) as Record<string, unknown>;
  const rawActions = Array.isArray(plan.actions) ? plan.actions : [];

  if (rawActions.length === 0) {
    return { summary: String(plan.summary ?? ''), actions: [], skipped: ['The model returned no actions.'] };
  }

  const actions: ResolvedAction[] = [];
  for (const item of rawActions) {
    const a = item as Record<string, unknown>;
    const tool = String(a.tool ?? '') as ToolName;
    const spec = TOOL_CATALOG.find((t) => t.name === tool);

    if (!spec) {
      skipped.push(`Unknown tool “${String(a.tool ?? '')}”`);
      continue;
    }

    const resolved = uniqueTabs(resolveSelector(a.select, tabs));
    if (resolved.length === 0) {
      skipped.push(`${spec.name} matched no tabs`);
      continue;
    }
    if (tool === 'activateTab' && resolved.length > 1) {
      skipped.push('activateTab targets more than one tab');
      continue;
    }
    if ((tool === 'createGroup' || tool === 'saveCollection') && !String(a.name ?? '').trim()) {
      skipped.push(`${spec.name} is missing a name`);
      continue;
    }
    if (tool === 'moveToGroup' && !String(a.group ?? '').trim()) {
      skipped.push('moveToGroup is missing a group title');
      continue;
    }

    const action: Action = {
      tool,
      select: a.select as TabSelector,
      reason: typeof a.reason === 'string' ? a.reason : undefined,
    };
    if (a.name) action.name = String(a.name).slice(0, 60);
    if (a.group) action.group = String(a.group).slice(0, 60);
    if (tool === 'createGroup') action.color = normalizeColor(a.color);

    actions.push({
      action,
      tabs: resolved,
      description: describeAction(action, resolved.length),
      destructive: DESTRUCTIVE_TOOLS.has(tool),
    });
  }

  return {
    summary: String(plan.summary ?? '').slice(0, 300),
    actions,
    skipped,
  };
}

/** Compact inventory so the model can reason about what exists. */
export function buildInventory(tabs: PlanTab[]): string {
  return tabs
    .map((t) => {
      const host = hostOf(t.url) || 'unknown';
      const flags = [
        t.groupId !== -1 ? `group:${t.groupName || t.groupId}` : '',
        t.pinned ? 'pinned' : '',
      ].filter(Boolean).join(' ');
      return `[ID:${t.id}] ${t.title || '(untitled)'} | ${host}${flags ? ` | ${flags}` : ''}`;
    })
    .join('\n');
}

export function catalogForPrompt(): string {
  return TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join('\n');
}

/** Pull the outermost JSON object out of a model reply (fences, prose, etc.). */
export function extractJson(content: string): unknown {
  let text = content;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text.trim());
}

/** Extract + validate a plan from a model reply. */
export function parsePlanResponse(content: string, tabs: PlanTab[]): ResolvedPlan {
  try {
    return validatePlan(extractJson(content), tabs);
  } catch {
    console.error('Failed to parse AI plan:', content.slice(0, 1000));
    throw new Error('The model did not return a usable plan. Try rephrasing.');
  }
}

import { describe, test, expect } from 'vitest';
import {
  resolveSelector,
  validatePlan,
  describeAction,
  parsePlanResponse,
  buildInventory,
  buildWindowSummary,
} from '../src/lib/ai/tools.js';
import type { PlanTab } from '../src/lib/ai/tools.js';

const TABS: PlanTab[] = [
  { id: 1, title: 'Inbox (12)', url: 'https://mail.google.com/mail/u/0', groupId: -1, pinned: false, windowId: 10, windowType: 'normal' },
  { id: 2, title: 'Sent', url: 'https://mail.google.com/mail/u/1', groupId: -1, pinned: false, windowId: 10, windowType: 'normal' },
  { id: 3, title: 'React docs', url: 'https://react.dev/learn', groupId: 7, groupName: 'Dev', pinned: false, windowId: 10, windowType: 'normal' },
  { id: 4, title: 'Pull requests', url: 'https://github.com/o/r/pulls', groupId: 7, groupName: 'Dev', pinned: true, windowId: 10, windowType: 'normal' },
  { id: 5, title: 'News', url: 'https://news.ycombinator.com/', groupId: -1, pinned: false, windowId: 10, windowType: 'normal' },
];

// a standalone (installed PWA) window holding only Gmail, plus its own tab
const APP_TABS: PlanTab[] = [
  ...TABS,
  { id: 6, title: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox', groupId: -1, pinned: false, windowId: 99, windowType: 'app' },
];

describe('resolveSelector', () => {
  test('ids picks exactly those tabs', () => {
    expect(resolveSelector({ ids: [1, 3] }, TABS).map((t) => t.id)).toEqual([1, 3]);
  });

  test('host matches subdomains of the named host', () => {
    expect(resolveSelector({ host: 'google.com' }, TABS).map((t) => t.id)).toEqual([1, 2]);
    expect(resolveSelector({ host: 'mail.google.com' }, TABS).map((t) => t.id)).toEqual([1, 2]);
  });

  test('host does not match a lookalike suffix', () => {
    expect(resolveSelector({ host: 'ogle.com' }, TABS)).toHaveLength(0);
  });

  test('urlContains and titleContains are case-insensitive', () => {
    expect(resolveSelector({ urlContains: 'github.com' }, TABS).map((t) => t.id)).toEqual([4]);
    expect(resolveSelector({ titleContains: 'INBOX' }, TABS).map((t) => t.id)).toEqual([1]);
  });

  test('ungrouped and pinned', () => {
    expect(resolveSelector({ ungrouped: true }, TABS).map((t) => t.id)).toEqual([1, 2, 5]);
    expect(resolveSelector({ pinned: true }, TABS).map((t) => t.id)).toEqual([4]);
  });

  test('malformed or empty selectors resolve to nothing, never everything', () => {
    expect(resolveSelector({}, TABS)).toHaveLength(0);
    expect(resolveSelector(null, TABS)).toHaveLength(0);
    expect(resolveSelector({ host: '   ' }, TABS)).toHaveLength(0);
    expect(resolveSelector({ ids: [] }, TABS)).toHaveLength(0);
    expect(resolveSelector('all', TABS)).toHaveLength(0);
    // explicit opt-in is the only way to get everything
    expect(resolveSelector({ all: true }, TABS)).toHaveLength(TABS.length);
  });
});

describe('window targeting', () => {
  test('windowType app isolates the standalone PWA window', () => {
    const got = resolveSelector({ windowType: 'app' }, APP_TABS).map((t) => t.id);
    expect(got).toEqual([6]);
  });

  test('windowType normal excludes the app window', () => {
    const got = resolveSelector({ windowType: 'normal' }, APP_TABS).map((t) => t.id);
    expect(got).not.toContain(6);
    expect(got).toContain(1);
  });

  test('windowId targets exactly one window', () => {
    expect(resolveSelector({ windowId: 99 }, APP_TABS).map((t) => t.id)).toEqual([6]);
    expect(resolveSelector({ windowId: 10 }, APP_TABS).map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test('tabs with no windowType count as normal', () => {
    const noType: PlanTab[] = [{ id: 1, title: 'x', url: 'https://a.com', groupId: -1 }];
    expect(resolveSelector({ windowType: 'normal' }, noType)).toHaveLength(1);
    expect(resolveSelector({ windowType: 'app' }, noType)).toHaveLength(0);
  });

  test('malformed window selectors resolve to nothing', () => {
    expect(resolveSelector({ windowType: '' }, APP_TABS)).toHaveLength(0);
    expect(resolveSelector({ windowId: 'nope' }, APP_TABS)).toHaveLength(0);
  });

  test('inventory flags non-normal windows so the model can target them', () => {
    expect(buildInventory(APP_TABS)).toContain('window:app#99');
    // normal windows are the default and stay unflagged
    expect(buildInventory(APP_TABS)).not.toContain('window:normal');
  });

  test('window summary lists id, type, count and hosts', () => {
    const summary = buildWindowSummary(APP_TABS);
    expect(summary).toContain('window 99 — app, 1 tabs');
    expect(summary).toContain('window 10 — normal');
    expect(summary).toContain('mail.google.com');
  });
});

describe('group targeting', () => {
  test('group name selects its tabs, case-insensitively', () => {
    expect(resolveSelector({ group: 'dev' }, TABS).map((t) => t.id)).toEqual([3, 4]);
    expect(resolveSelector({ group: 'Dev' }, TABS).map((t) => t.id)).toEqual([3, 4]);
  });

  test('group matching never falls back to ungrouped tabs', () => {
    expect(resolveSelector({ group: 'Nope' }, TABS)).toHaveLength(0);
    expect(resolveSelector({ group: '' }, TABS)).toHaveLength(0);
  });
});

describe('validatePlan', () => {
  test('resolves a valid plan into concrete tabs', () => {
    const plan = validatePlan(
      { summary: 'close gmail', actions: [{ tool: 'closeTabs', select: { host: 'mail.google.com' } }] },
      TABS,
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tabs.map((t) => t.id)).toEqual([1, 2]);
    expect(plan.actions[0].destructive).toBe(true);
    expect(plan.actions[0].description).toBe('Close 2 tabs');
    expect(plan.skipped).toHaveLength(0);
  });

  test('drops unknown tools instead of failing the whole plan', () => {
    const plan = validatePlan(
      { actions: [
        { tool: 'rm_rf', select: { all: true } },
        { tool: 'closeTabs', select: { ids: [5] } },
      ] },
      TABS,
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.skipped.join(' ')).toContain('Unknown tool');
  });

  test('drops actions that match no tabs', () => {
    const plan = validatePlan({ actions: [{ tool: 'closeTabs', select: { host: 'nope.example' } }] }, TABS);
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped.join(' ')).toContain('matched no tabs');
  });

  test('requires a name for createGroup and saveCollection', () => {
    const plan = validatePlan(
      { actions: [
        { tool: 'createGroup', select: { ids: [1, 2] } },
        { tool: 'saveCollection', select: { ids: [1, 2] } },
      ] },
      TABS,
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
  });

  test('normalizes colors and keeps a valid one', () => {
    const plan = validatePlan(
      { actions: [
        { tool: 'createGroup', name: 'Mail', color: 'PURPLE', select: { ids: [1, 2] } },
        { tool: 'createGroup', name: 'X', color: 'chartreuse', select: { ids: [3] } },
      ] },
      TABS,
    );
    expect(plan.actions[0].action.color).toBe('purple');
    expect(plan.actions[1].action.color).toBe('blue');
  });

  test('activateTab cannot target several tabs', () => {
    const plan = validatePlan({ actions: [{ tool: 'activateTab', select: { host: 'mail.google.com' } }] }, TABS);
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped.join(' ')).toContain('more than one tab');
  });

  test('empty action list is reported, not executed', () => {
    const plan = validatePlan({ summary: 'cannot do that', actions: [] }, TABS);
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped.join(' ')).toContain('no actions');
    expect(plan.summary).toBe('cannot do that');
  });

  test('dedupes repeated ids within one action', () => {
    const plan = validatePlan({ actions: [{ tool: 'closeTabs', select: { ids: [1, 1, 1] } }] }, TABS);
    expect(plan.actions[0].tabs).toHaveLength(1);
  });
});

describe('describeAction', () => {
  test('reads naturally and pluralizes', () => {
    expect(describeAction({ tool: 'closeTabs', select: { all: true } }, 1)).toBe('Close 1 tab');
    expect(describeAction({ tool: 'createGroup', name: 'Dev', select: { all: true } }, 3)).toBe('Group 3 tabs as “Dev”');
    expect(describeAction({ tool: 'saveCollection', name: 'Trip', select: { all: true } }, 2)).toBe('Save 2 tabs to collection “Trip”');
  });
});

describe('parsePlanResponse', () => {
  test('handles fenced JSON and surrounding prose', () => {
    const plan = parsePlanResponse(
      'Sure!\n```json\n{"summary":"s","actions":[{"tool":"closeTabs","select":{"ids":[1]}}]}\n```\nDone.',
      TABS,
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tabs[0].id).toBe(1);
  });

  test('throws a usable message on garbage', () => {
    expect(() => parsePlanResponse('I cannot help with that', TABS)).toThrow(/did not return a usable plan/);
  });
});

describe('buildInventory', () => {
  test('includes ids, host and group/pin flags', () => {
    const inv = buildInventory(TABS);
    expect(inv).toContain('[ID:1] Inbox (12) | mail.google.com');
    expect(inv).toContain('group:Dev');
    expect(inv).toContain('pinned');
  });
});

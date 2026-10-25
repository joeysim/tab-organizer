import { describe, test, expect } from 'vitest';
import {
  resolveSelector,
  validatePlan,
  describeAction,
  parsePlanResponse,
  buildInventory,
} from '../src/lib/ai/tools.js';
import type { PlanTab } from '../src/lib/ai/tools.js';

const TABS: PlanTab[] = [
  { id: 1, title: 'Inbox (12)', url: 'https://mail.google.com/mail/u/0', groupId: -1, pinned: false },
  { id: 2, title: 'Sent', url: 'https://mail.google.com/mail/u/1', groupId: -1, pinned: false },
  { id: 3, title: 'React docs', url: 'https://react.dev/learn', groupId: 7, groupName: 'Dev', pinned: false },
  { id: 4, title: 'Pull requests', url: 'https://github.com/o/r/pulls', groupId: 7, groupName: 'Dev', pinned: true },
  { id: 5, title: 'News', url: 'https://news.ycombinator.com/', groupId: -1, pinned: false },
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

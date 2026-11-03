/**
 * @vitest-environment jsdom
 * Executing an approved plan and undoing it.
 *
 * These lock three data-integrity behaviours:
 *  - a second Approve click must not run the plan twice
 *  - a failed action must not be reported as success, and must not be recorded
 *    for undo (undo would otherwise reopen tabs that never closed)
 *  - undoing a created group must put tabs back where they were, not leave them
 *    ungrouped
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

function seedDom() {
  document.body.innerHTML = `
    <div id="modalOverlay"></div>
    <div class="ai-progress" id="aiPlanProgress"></div>
    <button id="approvePlanBtn"></button>
    <div id="aiPlanContent"></div>
    <p id="aiPlanSummary"></p>
    <div id="labcard" hidden></div>
    <div id="undoBar"></div><span id="undoBarText"></span>
    <span id="tabCount"></span><div id="groupList"></div><div id="tabGrid"></div>
    <div id="emptyState"></div><div id="loading"></div>
    <div id="selectionInfo"></div><span id="selectedCount"></span>
  `;
}

type Sent = Record<string, unknown>;

function installChrome(handler?: (msg: Sent) => Sent | undefined) {
  const sent: Sent[] = [];
  const mock = {
    runtime: {
      sendMessage: vi.fn(async (msg: Sent) => {
        sent.push(msg);
        const override = handler?.(msg);
        if (override) return override;
        if (msg.action === 'getTabs') return { success: true, tabs: [] };
        if (msg.action === 'getGroups') return { success: true, groups: [] };
        if (msg.action === 'createGroup') return { success: true, groupId: 77 };
        return { success: true };
      }),
    },
  };
  (globalThis as unknown as Record<string, unknown>).chrome = mock as never;
  return { sent };
}

const TABS = [
  { id: 1, title: 'Inbox', url: 'https://mail.google.com/a', favIconUrl: '', groupId: 5, groupName: 'Work', groupColor: 'blue', windowId: 1, windowType: 'normal', index: 0, active: false, pinned: false },
  { id: 2, title: 'Sent', url: 'https://mail.google.com/b', favIconUrl: '', groupId: 5, groupName: 'Work', groupColor: 'blue', windowId: 1, windowType: 'normal', index: 1, active: false, pinned: false },
];

async function load(tabs = TABS) {
  seedDom();
  const chromeMock = installChrome();
  vi.resetModules();
  const { state } = await import('../src/newtab/app/state.js');
  state.tabs = tabs as never;
  state.groups = [{ id: 5, title: 'Work', color: 'blue', collapsed: false, tabs: [] }] as never;
  const ai = await import('../src/newtab/app/ai.js');
  return { ai, state, sent: chromeMock.sent };
}

const planFor = (action: Record<string, unknown>) => ({
  summary: 'test',
  actions: [{
    action,
    tabs: [{ id: 1, title: 'Inbox', url: 'https://mail.google.com/a', groupId: 5 }, { id: 2, title: 'Sent', url: 'https://mail.google.com/b', groupId: 5 }],
    description: 'x',
    destructive: action.tool === 'closeTabs',
  }],
  skipped: [],
});

describe('approvePlan', () => {
  beforeEach(() => vi.useRealTimers());

  test('a second click does not run the plan twice', async () => {
    const { ai, sent } = await load();
    ai.renderPlan(planFor({ tool: 'closeTabs', select: { ids: [1, 2] } }) as never);

    await Promise.all([ai.approvePlan(), ai.approvePlan()]);

    const closes = sent.filter((m) => m.action === 'closeTabs');
    expect(closes).toHaveLength(1);
  });

  test('a failed action is reported as stopped, not as done', async () => {
    seedDom();
    const sent: Sent[] = [];
    (globalThis as unknown as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: Sent) => {
          sent.push(msg);
          if (msg.action === 'closeTabs') return { error: 'Tabs cannot be edited right now' };
          if (msg.action === 'getTabs') return { success: true, tabs: [] };
          if (msg.action === 'getGroups') return { success: true, groups: [] };
          return { success: true };
        }),
      },
    } as never;
    vi.resetModules();
    const { state } = await import('../src/newtab/app/state.js');
    state.tabs = TABS as never;
    state.groups = [];
    const ai = await import('../src/newtab/app/ai.js');
    ai.renderPlan(planFor({ tool: 'closeTabs', select: { ids: [1, 2] } }) as never);

    await ai.approvePlan();

    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toContain('Stopped');
    expect(toast?.className).toContain('toast-error');
  });

  test('a failed close records nothing, so undo does not reopen it', async () => {
    seedDom();
    const sent: Sent[] = [];
    (globalThis as unknown as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: Sent) => {
          sent.push(msg);
          if (msg.action === 'closeTabs') return { error: 'nope' };
          if (msg.action === 'getTabs') return { success: true, tabs: [] };
          if (msg.action === 'getGroups') return { success: true, groups: [] };
          return { success: true };
        }),
      },
    } as never;
    vi.resetModules();
    const { state } = await import('../src/newtab/app/state.js');
    state.tabs = TABS as never;
    state.groups = [];
    const ai = await import('../src/newtab/app/ai.js');
    ai.renderPlan(planFor({ tool: 'closeTabs', select: { ids: [1, 2] } }) as never);
    await ai.approvePlan();

    sent.length = 0;
    await ai.undoPlan();

    expect(sent.some((m) => m.action === 'reopenTabs')).toBe(false);
  });

  test('undo of a created group puts tabs back in their previous group', async () => {
    const { ai, sent } = await load();
    ai.renderPlan(planFor({ tool: 'createGroup', name: 'Project', color: 'blue', select: { ids: [1, 2] } }) as never);

    await ai.approvePlan();
    expect(sent.some((m) => m.action === 'createGroup')).toBe(true);

    sent.length = 0;
    await ai.undoPlan();

    const moves = sent.filter((m) => m.action === 'moveToGroup');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.groupId === 5)).toBe(true);
  });
});

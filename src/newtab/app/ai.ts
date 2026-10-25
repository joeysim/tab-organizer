/**
 * ai.ts — run a prompt -> plan -> preview -> approve -> execute -> undo.
 *
 * The model never touches the browser. It returns a plan; we resolve selectors
 * against live tabs, show exactly what will happen, and only then call the same
 * background actions the UI already uses.
 */
import { state } from './state.js';
import { showToast } from './toast.js';
import { CollectionManager } from '../../lib/collections/index.js';
import type { Action, PlanTab, ResolvedAction, ResolvedPlan } from '../../lib/ai/tools.js';

let plan: ResolvedPlan | null = null;
let planAbort: AbortController | null = null;
let progressTimer: ReturnType<typeof setInterval> | undefined;

/** Inverses recorded while executing, replayed by undo(). */
type UndoSnapshot = {
  closedTabs: Array<{ url: string; title: string }>;
  createdGroupIds: number[];
  movedTabs: Array<{ tabId: number; previousGroupId: number }>;
};

let undoSnapshot: UndoSnapshot | null = null;

/** Conversation for the AI pane: user requests and what the extension did. */
type Turn = { role: 'user' | 'bot'; text: string; points?: string[]; meta?: string };
let thread: Turn[] = [];

function threadEl(): HTMLElement | null {
  return document.getElementById('aiThread');
}

export function renderThread(): void {
  const el = threadEl();
  if (!el) return;
  el.textContent = '';
  if (thread.length === 0) {
    const p = document.createElement('p');
    p.className = 'ai-thread-empty';
    p.textContent = 'Ask for anything: “close all gmail tabs”, “group my tabs by project”, “save this session”.';
    el.appendChild(p);
    return;
  }
  for (const turn of thread) {
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${turn.role}`;
    const body = document.createElement('span');
    body.textContent = turn.text;
    msg.appendChild(body);
    if (turn.points?.length) {
      const ul = document.createElement('ul');
      ul.className = 'ai-msg-list';
      for (const point of turn.points) {
        const li = document.createElement('li');
        li.textContent = point;
        ul.appendChild(li);
      }
      msg.appendChild(ul);
    }
    if (turn.meta) {
      const meta = document.createElement('span');
      meta.className = 'ai-msg-meta';
      meta.textContent = turn.meta;
      msg.appendChild(meta);
    }
    el.appendChild(msg);
  }
  el.scrollTop = el.scrollHeight;
}

function pushTurn(turn: Turn): void {
  thread.push(turn);
  if (thread.length > 20) thread = thread.slice(-20);
  renderThread();
}

/** Recent turns, so a follow-up like "now do the same for figma" still lands. */
function historyForPrompt(): string {
  if (thread.length === 0) return '';
  return thread
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'user' : 'you'}: ${t.text}`)
    .join('\n');
}

export function resetThread(): void {
  thread = [];
  renderThread();
}

function planTabs(): PlanTab[] {
  return state.tabs
    .filter((t) => /^https?:/i.test(t.url))
    .map((t) => ({
      id: t.id,
      title: t.title || '',
      url: t.url,
      groupId: t.groupId ?? -1,
      groupName: t.groupName ?? null,
      pinned: t.pinned,
    }));
}

function setProgress(active: boolean, label: string): void {
  const bar = document.getElementById('aiPlanProgress');
  clearInterval(progressTimer);
  if (bar) bar.classList.toggle('active', active);
  if (!active) return;
  const summary = document.getElementById('aiPlanSummary');
  const started = Date.now();
  const tick = () => {
    if (!summary) return;
    summary.textContent = `${label} · ${Math.floor((Date.now() - started) / 1000)}s`;
  };
  tick();
  progressTimer = setInterval(tick, 250);
}

function showModal(): void {
  document.getElementById('modalOverlay')?.classList.add('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));
  const target = document.getElementById('aiActionModal');
  if (target) target.style.display = 'flex';
}

export function closePlanModal(): void {
  planAbort?.abort();
  planAbort = null;
  clearInterval(progressTimer);
  document.getElementById('aiPlanProgress')?.classList.remove('active');
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));
}

/** Resolve the provider and turn free text into a validated plan. */
export async function runPlan(request: string): Promise<void> {
  const text = request.trim();
  if (!text) return;
  if (!state.settings.apiKey) {
    showToast('Add an API key in Settings first', 'error');
    return;
  }

  planAbort?.abort();
  const ctrl = (planAbort = new AbortController());
  const tabs = planTabs();

  showModal();
  const summary = document.getElementById('aiPlanSummary');
  const approve = document.getElementById('approvePlanBtn') as HTMLButtonElement | null;
  const content = document.getElementById('aiPlanContent');
  if (summary) summary.textContent = 'Planning…';
  if (approve) { approve.disabled = true; approve.textContent = 'Planning…'; }
  if (content) {
    content.innerHTML = `<div class="ai-skeleton-group">${Array.from({ length: 3 }).map(() => `
      <div class="ai-skeleton-card"><div class="ai-skeleton-line head"></div><div class="ai-skeleton-line"></div><div class="ai-skeleton-line short"></div></div>`).join('')}</div>`;
  }
  setProgress(true, `Planning “${text.slice(0, 40)}”`);

  try {
    const providerName = (state.settings as unknown as { aiProvider?: 'claude' | 'lunaroute' }).aiProvider ?? 'lunaroute';
    const { getProvider } = await import('../../lib/ai/provider.js');
    const provider = await getProvider(providerName);
    const history = historyForPrompt();
    const request = history
      ? `Earlier in this conversation:\n${history}\n\nCurrent request: ${text}`
      : text;
    const result = await provider.planActions(request, tabs, state.settings.apiKey, { signal: ctrl.signal });
    if (ctrl !== planAbort) return;
    planAbort = null;
    setProgress(false, '');
    plan = result;
    pushTurn({ role: 'user', text });
    pushTurn({
      role: 'bot',
      text: result.summary || (result.actions.length ? 'Here is what I would do.' : 'I could not do that with the tools I have.'),
      points: result.actions.map((a) => a.description),
      meta: result.actions.length
        ? `${result.actions.length} action${result.actions.length === 1 ? '' : 's'} · review before applying`
        : undefined,
    });
    renderPlan(result);
  } catch (error) {
    if (ctrl !== planAbort) return;
    planAbort = null;
    setProgress(false, '');
    pushTurn({ role: 'user', text });
    pushTurn({ role: 'bot', text: `That failed: ${(error as Error).name === 'TimeoutError' ? 'request timed out' : (error as Error).message}` });
    if (summary) summary.textContent = 'Failed';
    if (approve) { approve.disabled = true; approve.textContent = 'Nothing to approve'; }
    if (content) {
      content.textContent = '';
      const p = document.createElement('p');
      p.style.color = 'var(--danger-color)';
      p.textContent = `Error: ${(error as Error).name === 'TimeoutError' ? 'Request timed out' : (error as Error).message}`;
      const hint = document.createElement('p');
      hint.className = 'ai-hint';
      hint.textContent = 'Check your API key and provider in Settings, then try again.';
      content.append(p, hint);
    }
  }
}

function tabRow(tabId: number): HTMLElement | null {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return null;
  const row = document.createElement('div');
  row.className = 'plan-tab';

  let host = tab.url || '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* keep */ }

  const ic = document.createElement('span');
  ic.className = 'ai-group-tab-fallback';
  ic.textContent = '·';
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.className = 'ai-group-tab-favicon';
    img.src = tab.favIconUrl;
    img.alt = '';
    img.onerror = () => img.replaceWith(ic);
    row.appendChild(img);
  } else {
    row.appendChild(ic);
  }

  const title = document.createElement('span');
  title.className = 'ai-group-tab-title';
  title.textContent = tab.title || host;
  const hostEl = document.createElement('span');
  title.title = tab.url;
  hostEl.className = 'ai-group-tab-host';
  hostEl.textContent = host;
  row.append(title, hostEl);
  return row;
}

export function renderPlan(result: ResolvedPlan): void {
  const content = document.getElementById('aiPlanContent');
  const summary = document.getElementById('aiPlanSummary');
  const approve = document.getElementById('approvePlanBtn') as HTMLButtonElement | null;
  if (!content) return;
  content.textContent = '';

  const destructive = result.actions.some((a) => a.destructive);
  const totalTabs = result.actions.reduce((n, a) => n + a.tabs.length, 0);

  if (summary) {
    summary.textContent = result.actions.length
      ? `${result.actions.length} action${result.actions.length === 1 ? '' : 's'} · ${totalTabs} tab${totalTabs === 1 ? '' : 's'}${destructive ? ' · includes tab closing' : ''}`
      : 'Nothing to do';
  }
  if (approve) {
    approve.disabled = result.actions.length === 0;
    approve.textContent = destructive ? 'Approve & close tabs' : 'Approve';
  }

  if (result.summary) {
    const s = document.createElement('p');
    s.className = 'plan-summary';
    s.textContent = result.summary;
    content.appendChild(s);
  }

  result.actions.forEach((a: ResolvedAction) => {
    const card = document.createElement('div');
    card.className = `plan-action${a.destructive ? ' destructive' : ''}`;

    const head = document.createElement('div');
    head.className = 'plan-action-head';
    const title = document.createElement('span');
    title.className = 'plan-action-title';
    title.textContent = a.description;
    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${a.tabs.length}`;
    head.append(title, count);

    const reason = document.createElement('div');
    reason.className = 'plan-action-reason';
    reason.textContent = a.action.reason || a.action.tool;

    const list = document.createElement('div');
    list.className = 'plan-tabs';
    a.tabs.slice(0, 12).forEach((t) => {
      const row = tabRow(t.id);
      if (row) list.appendChild(row);
    });
    if (a.tabs.length > 12) {
      const more = document.createElement('div');
      more.className = 'ai-hint';
      more.textContent = `+${a.tabs.length - 12} more`;
      list.appendChild(more);
    }

    card.append(head, reason, list);
    content.appendChild(card);
  });

  if (result.skipped.length) {
    const notes = document.createElement('div');
    notes.className = 'plan-skipped';
    notes.textContent = `Skipped: ${result.skipped.join('; ')}`;
    content.appendChild(notes);
  }

  if (result.actions.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'ai-hint';
    hint.textContent = 'Try naming the sites or titles involved, e.g. “close all gmail tabs”.';
    content.appendChild(hint);
  }
}

/** Execute an approved plan, recording inverses as we go. */
export async function approvePlan(): Promise<void> {
  if (!plan || plan.actions.length === 0) return;
  const snapshot: UndoSnapshot = { closedTabs: [], createdGroupIds: [], movedTabs: [] };

  try {
    for (const item of plan.actions) {
      await executeAction(item, snapshot);
    }
  } catch (error) {
    showToast(`Stopped: ${(error as Error).message}`, 'error');
  }

  undoSnapshot = snapshot;
  plan = null;
  closePlanModal();

  const { loadTabs } = await import('./render.js');
  await loadTabs(false);

  const parts: string[] = [];
  if (snapshot.closedTabs.length) parts.push(`closed ${snapshot.closedTabs.length}`);
  if (snapshot.createdGroupIds.length) parts.push(`${snapshot.createdGroupIds.length} group${snapshot.createdGroupIds.length === 1 ? '' : 's'}`);
  pushTurn({
    role: 'bot',
    text: parts.length ? `Done — ${parts.join(', ')}.` : 'Plan applied.',
    meta: 'Undo is available for 20s',
  });
  showToast(parts.length ? `Done — ${parts.join(', ')}` : 'Plan applied', 'success');
  showUndoBar();
}

async function executeAction(item: ResolvedAction, snapshot: UndoSnapshot): Promise<void> {
  const { action, tabs } = item;
  const tabIds = tabs.map((t) => t.id);

  switch (action.tool) {
    case 'closeTabs': {
      snapshot.closedTabs.push(...tabs.map((t) => ({ url: t.url, title: t.title })));
      await chrome.runtime.sendMessage({ action: 'closeTabs', tabIds });
      return;
    }
    case 'createGroup': {
      const res = (await chrome.runtime.sendMessage({
        action: 'createGroup',
        name: action.name || 'Group',
        color: action.color || 'blue',
        tabIds,
      })) as { groupId?: number };
      if (res?.groupId !== undefined) snapshot.createdGroupIds.push(res.groupId);
      return;
    }
    case 'moveToGroup': {
      const target = state.groups.find(
        (g) => (g.title || '').toLowerCase() === (action.group || '').toLowerCase() && g.id !== -1,
      );
      if (!target) {
        // no such group yet: create it from these tabs instead of failing
        const res = (await chrome.runtime.sendMessage({
          action: 'createGroup',
          name: action.group || 'Group',
          color: 'blue',
          tabIds,
        })) as { groupId?: number };
        if (res?.groupId !== undefined) snapshot.createdGroupIds.push(res.groupId);
        return;
      }
      for (const t of tabs) snapshot.movedTabs.push({ tabId: t.id, previousGroupId: t.groupId });
      await chrome.runtime.sendMessage({ action: 'moveToGroup', groupId: target.id, tabIds });
      return;
    }
    case 'ungroupTabs': {
      for (const t of tabs) snapshot.movedTabs.push({ tabId: t.id, previousGroupId: t.groupId });
      await chrome.runtime.sendMessage({ action: 'ungroup', tabIds });
      return;
    }
    case 'saveCollection': {
      await CollectionManager.saveCollection(
        action.name || 'Collection',
        '',
        tabs.map((t) => ({ url: t.url, title: t.title })),
      );
      return;
    }
    case 'activateTab': {
      await chrome.runtime.sendMessage({ action: 'activateTab', tabId: tabs[0].id });
      return;
    }
    default:
      throw new Error(`Unsupported tool: ${(action as Action).tool}`);
  }
}

export function showUndoBar(): void {
  const bar = document.getElementById('undoBar');
  if (!bar) return;
  if (!undoSnapshot) return;
  const label = document.getElementById('undoBarText');
  if (label) {
    const bits: string[] = [];
    if (undoSnapshot.closedTabs.length) bits.push(`${undoSnapshot.closedTabs.length} closed`);
    if (undoSnapshot.createdGroupIds.length) bits.push(`${undoSnapshot.createdGroupIds.length} grouped`);
    if (undoSnapshot.movedTabs.length) bits.push(`${undoSnapshot.movedTabs.length} moved`);
    label.textContent = `AI applied changes (${bits.join(', ') || 'none'})`;
  }
  bar.classList.add('visible');
  clearTimeout((bar as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
  (bar as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
    bar.classList.remove('visible');
  }, 20000);
}

export function hideUndoBar(): void {
  document.getElementById('undoBar')?.classList.remove('visible');
}

/** Replay the recorded inverses, newest first. */
export async function undoPlan(): Promise<void> {
  const snap = undoSnapshot;
  if (!snap) return;
  undoSnapshot = null;
  hideUndoBar();

  try {
    for (const moved of [...snap.movedTabs].reverse()) {
      if (moved.previousGroupId === -1) {
        await chrome.runtime.sendMessage({ action: 'ungroup', tabIds: [moved.tabId] });
      } else {
        await chrome.runtime.sendMessage({
          action: 'moveToGroup',
          groupId: moved.previousGroupId,
          tabIds: [moved.tabId],
        });
      }
    }
    for (const groupId of snap.createdGroupIds) {
      await chrome.runtime.sendMessage({ action: 'deleteGroup', groupId }).catch(() => undefined);
    }
    if (snap.closedTabs.length) {
      await chrome.runtime.sendMessage({ action: 'reopenTabs', tabs: snap.closedTabs });
    }
    pushTurn({ role: 'bot', text: 'Undone.' });
    showToast('Undone', 'success');
  } catch (error) {
    showToast(`Undo failed: ${(error as Error).message}`, 'error');
  }

  const { loadTabs } = await import('./render.js');
  await loadTabs(false);
}

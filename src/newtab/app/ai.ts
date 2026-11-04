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
  void import('./lab.js').then((m) => m.clearCard());
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
    const result = await provider.planActions(text, tabs, state.settings.apiKey, { signal: ctrl.signal });
    if (ctrl !== planAbort) return;
    planAbort = null;
    setProgress(false, '');
    plan = result;
    // report in the Lab card while the approval modal is open
    {
      const { setCard } = await import('./lab.js');
      setCard(
        text,
        result.actions.length ? `${result.actions.length} action${result.actions.length === 1 ? '' : 's'}` : 'nothing to do',
        result.summary || (result.actions.length ? 'Review the plan, then approve.' : 'I could not do that with the tools I have.'),
      );
    }
    renderPlan(result);
  } catch (error) {
    if (ctrl !== planAbort) return;
    planAbort = null;
    setProgress(false, '');
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
  // single source of truth: what is on screen is what Approve will run
  plan = result;
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
  // Claim the plan before the first await: a second click must be a no-op,
  // not a second run of the same actions.
  const running = plan;
  if (!running || running.actions.length === 0) return;
  plan = null;
  const approveBtn = document.getElementById('approvePlanBtn') as HTMLButtonElement | null;
  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.textContent = 'Applying…';
  }

  const snapshot: UndoSnapshot = { closedTabs: [], createdGroupIds: [], movedTabs: [] };
  let stopped: string | null = null;

  try {
    for (const item of running.actions) {
      await executeAction(item, snapshot);
    }
  } catch (error) {
    stopped = (error as Error).message;
  }

  undoSnapshot = snapshot;
  closePlanModal();

  const { loadTabs } = await import('./render.js');
  await loadTabs(false);

  const parts: string[] = [];
  if (snapshot.closedTabs.length) parts.push(`closed ${snapshot.closedTabs.length}`);
  if (snapshot.createdGroupIds.length) parts.push(`${snapshot.createdGroupIds.length} group${snapshot.createdGroupIds.length === 1 ? '' : 's'}`);
  const didSomething = parts.length > 0 || snapshot.movedTabs.length > 0;

  if (stopped) {
    // say what actually happened; never report success after a failure
    showToast(didSomething ? `Stopped — ${parts.join(', ') || 'partial'}: ${stopped}` : `Stopped: ${stopped}`, 'error');
  } else {
    showToast(parts.length ? `Done — ${parts.join(', ')}` : 'Plan applied', 'success');
  }
  if (didSomething) showUndoBar();
}

/**
 * Send a background action and surface its error.
 * The background catches its own failures and replies {error}, so a resolved
 * promise does not mean the action worked.
 */
async function send(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = (await chrome.runtime.sendMessage(message)) as Record<string, unknown> | undefined;
  if (res && typeof res.error === 'string') throw new Error(res.error);
  return res ?? {};
}

function rememberPreviousGroups(tabs: ResolvedAction['tabs'], snapshot: UndoSnapshot): void {
  for (const t of tabs) snapshot.movedTabs.push({ tabId: t.id, previousGroupId: t.groupId });
}

async function executeAction(item: ResolvedAction, snapshot: UndoSnapshot): Promise<void> {
  const { action, tabs } = item;
  const tabIds = tabs.map((t) => t.id);

  switch (action.tool) {
    case 'closeTabs': {
      await send({ action: 'closeTabs', tabIds });
      // only after it worked: undo must not reopen tabs that never closed
      snapshot.closedTabs.push(...tabs.map((t) => ({ url: t.url, title: t.title })));
      return;
    }
    case 'createGroup': {
      const res = await send({
        action: 'createGroup',
        name: action.name || 'Group',
        color: action.color || 'blue',
        tabIds,
      });
      if (typeof res.groupId === 'number') {
        snapshot.createdGroupIds.push(res.groupId);
        // deleting the new group only ungroups: remember where these tabs were
        rememberPreviousGroups(tabs, snapshot);
      }
      return;
    }
    case 'moveToGroup': {
      const target = state.groups.find(
        (g) => (g.title || '').toLowerCase() === (action.group || '').toLowerCase() && g.id !== -1,
      );
      if (!target) {
        // no such group yet: create it from these tabs instead of failing
        const res = await send({ action: 'createGroup', name: action.group || 'Group', color: 'blue', tabIds });
        if (typeof res.groupId === 'number') {
          snapshot.createdGroupIds.push(res.groupId);
          rememberPreviousGroups(tabs, snapshot);
        }
        return;
      }
      await send({ action: 'moveToGroup', groupId: target.id, tabIds });
      rememberPreviousGroups(tabs, snapshot);
      return;
    }
    case 'ungroupTabs': {
      await send({ action: 'ungroup', tabIds });
      rememberPreviousGroups(tabs, snapshot);
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
      await send({ action: 'activateTab', tabId: tabs[0].id });
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
    showToast('Undone', 'success');
  } catch (error) {
    showToast(`Undo failed: ${(error as Error).message}`, 'error');
  }

  const { loadTabs } = await import('./render.js');
  await loadTabs(false);
}

/* ---------- summaries ---------- */

let summaryAbort: AbortController | null = null;

function summaryHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/**
 * Read the open tabs and turn each into one line. Content stays here: it is not
 * sent to the planner, only the summaries are (and only when asked for).
 */
export async function showSummaries(): Promise<void> {
  summaryAbort?.abort();
  const ctrl = (summaryAbort = new AbortController());
  const tabs = state.tabs
    .filter((t) => /^https?:/i.test(t.url))
    .map((t) => ({ id: t.id, url: t.url, title: t.title || '' }));

  const modal = document.getElementById('summaryModal');
  const list = document.getElementById('summaryList');
  const subtitle = document.getElementById('summarySubtitle');
  const progress = document.getElementById('summaryProgress');
  if (!modal || !list) return;

  document.getElementById('modalOverlay')?.classList.add('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));
  modal.style.display = 'flex';
  progress?.classList.add('active');

  if (!state.settings.apiKey) {
    subtitle && (subtitle.textContent = 'Add an API key in Settings first');
    progress?.classList.remove('active');
    return;
  }
  if (tabs.length === 0) {
    subtitle && (subtitle.textContent = 'No readable tabs');
    progress?.classList.remove('active');
    return;
  }

  list.innerHTML = `<div class="ai-skeleton-group">${Array.from({ length: 3 }).map(() => `
    <div class="ai-skeleton-card"><div class="ai-skeleton-line head"></div><div class="ai-skeleton-line"></div></div>`).join('')}</div>`;
  const started = Date.now();
  const tick = window.setInterval(() => {
    if (subtitle) subtitle.textContent = `Reading ${tabs.length} page${tabs.length === 1 ? '' : 's'} · ${Math.floor((Date.now() - started) / 1000)}s`;
  }, 500);
  if (subtitle) subtitle.textContent = `Reading ${tabs.length} page${tabs.length === 1 ? '' : 's'}…`;

  try {
    const providerName = (state.settings as unknown as { aiProvider?: 'claude' | 'lunaroute' }).aiProvider ?? 'lunaroute';
    const { summarizeTabs } = await import('../../lib/ai/summarize.js');
    const rows = await summarizeTabs(tabs, state.settings.apiKey, providerName, { signal: ctrl.signal });
    if (ctrl !== summaryAbort) return;
    summaryAbort = null;
    renderSummaries(rows, subtitle);
  } catch (error) {
    if (ctrl !== summaryAbort) return;
    summaryAbort = null;
    if (subtitle) subtitle.textContent = `Failed: ${(error as Error).message}`;
    list.textContent = '';
    const p = document.createElement('p');
    p.className = 'ai-hint';
    p.textContent = 'Check your API key and provider in Settings, then try again.';
    list.appendChild(p);
  } finally {
    window.clearInterval(tick);
    progress?.classList.remove('active');
  }
}

type SummaryRow = { tabId: number; url: string; title: string; summary: string; cached: boolean; error?: string };

export function renderSummaries(rows: SummaryRow[], subtitle?: HTMLElement | null): void {
  const list = document.getElementById('summaryList');
  if (!list) return;
  list.textContent = '';

  const done = rows.filter((r) => r.summary).length;
  const cached = rows.filter((r) => r.cached).length;
  const target = subtitle ?? document.getElementById('summarySubtitle');
  if (target) {
    const bits = [`${done} of ${rows.length} summarised`];
    if (cached) bits.push(`${cached} from cache`);
    target.textContent = bits.join(' · ');
  }

  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'summary-row';

    const left = document.createElement('div');
    left.className = 'summary-tab';
    const title = document.createElement('span');
    title.className = 'summary-tab-title';
    title.textContent = row.title || row.url;
    title.title = row.url;
    const host = document.createElement('span');
    host.className = 'summary-tab-host';
    host.textContent = summaryHost(row.url);
    left.append(title, host);

    const right = document.createElement('div');
    right.className = 'summary-text';
    if (row.summary) {
      right.textContent = row.summary;
      if (row.cached) {
        const tag = document.createElement('span');
        tag.className = 'summary-cached';
        tag.textContent = ' · cached';
        right.appendChild(tag);
      }
    } else {
      right.classList.add('empty');
      right.textContent = row.error ? `Could not read: ${row.error}` : 'Nothing readable on this page';
    }

    el.append(left, right);
    list.appendChild(el);
  }
}

export function closeSummaries(): void {
  summaryAbort?.abort();
  summaryAbort = null;
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.querySelectorAll('.modal').forEach((m) => ((m as HTMLElement).style.display = 'none'));
}

/** Markdown of the current summaries, for the Copy button. */
export function summariesAsMarkdown(): string {
  const rows = Array.from(document.querySelectorAll('#summaryList .summary-row'));
  return rows
    .map((row) => {
      const title = row.querySelector('.summary-tab-title')?.textContent ?? '';
      const host = row.querySelector('.summary-tab-host')?.textContent ?? '';
      const text = row.querySelector('.summary-text')?.textContent?.replace(/ · cached$/, '') ?? '';
      return `- **${title}** (${host}) — ${text}`;
    })
    .join('\n');
}

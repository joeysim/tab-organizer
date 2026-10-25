/**
 * lab.ts — The Lab, adopted from the Write On pattern: a bottom-center button
 * that opens a popover of one-line rows (guide, baked recipes, proposals) with a
 * free-form composer at the foot, plus a status card that reports on a pass.
 *
 * Everything the Lab can do already exists: recipes are prompts, proposals are
 * computed locally from the open tabs, and running either goes through the same
 * plan -> preview -> approve -> undo path.
 */
import { state } from './state.js';
import { showToast } from './toast.js';

type Row =
  | { kind: 'guide' }
  | { kind: 'recipe'; label: string; note: string; prompt?: string; group?: boolean }
  | { kind: 'proposal'; label: string; note: string; prompt?: string; group?: boolean };

let open = false;
let rows: HTMLElement[] = [];
let current = 0;

/** Hostname without www, for grouping proposals. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Baked recipes: the things most people want, no thinking required. */
function bakedRecipes(): Row[] {
  return [
    { kind: 'recipe', label: 'Group tabs by project', note: 'not by website', group: true },
    { kind: 'recipe', label: 'Close duplicate tabs', note: 'one per URL', prompt: 'Close duplicate tabs, keeping one per URL' },
    { kind: 'recipe', label: 'Save this session', note: 'as a collection of links', prompt: 'Save all my open tabs as a collection called Session' },
  ];
}

/**
 * Proposals computed from the actual tabs — instant, no model call. Each one is
 * something the tab set plainly suggests.
 */
export function proposeActions(): Row[] {
  const tabs = state.tabs;
  const out: Row[] = [];

  const byUrl = new Map<string, number>();
  for (const t of tabs) byUrl.set(t.url, (byUrl.get(t.url) || 0) + 1);
  const dupes = [...byUrl.values()].reduce((n, c) => n + (c > 1 ? c - 1 : 0), 0);
  if (dupes > 0) {
    out.push({
      kind: 'proposal',
      label: `Close ${dupes} duplicate tab${dupes === 1 ? '' : 's'}`,
      note: 'same URL open more than once',
      prompt: 'Close duplicate tabs, keeping one per URL',
    });
  }

  const byHost = new Map<string, number>();
  for (const t of tabs) {
    const h = hostOf(t.url);
    if (h) byHost.set(h, (byHost.get(h) || 0) + 1);
  }
  const [topHost, topCount] = [...byHost.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (topHost && topCount >= 4) {
    out.push({
      kind: 'proposal',
      label: `Close ${topCount} tabs on ${topHost}`,
      note: 'grouped by site',
      prompt: `Close all tabs on ${topHost}`,
    });
  }

  const ungrouped = tabs.filter((t) => (t.groupId ?? -1) === -1).length;
  if (ungrouped >= 5) {
    out.push({
      kind: 'proposal',
      label: `Organize ${ungrouped} ungrouped tabs`,
      note: 'preview before applying',
      group: true,
    });
  }

  const inGroups = new Set(tabs.filter((t) => (t.groupId ?? -1) !== -1).map((t) => t.groupId)).size;
  if (inGroups >= 3) {
    out.push({
      kind: 'proposal',
      label: `Save ${inGroups} groups as collections`,
      note: 'one collection per group',
      prompt: 'Save the tabs in each of my groups as a separate collection',
    });
  }

  return out.slice(0, 3);
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildMenu(): void {
  const menu = document.getElementById('labmenu');
  if (!menu) return;
  menu.textContent = '';
  rows = [];

  const addRow = (row: Row): HTMLElement => {
    const node = el('div', 'lab-row');
    node.setAttribute('role', 'menuitem');
    node.tabIndex = -1;

    if (row.kind === 'guide') {
      node.classList.add('lab-guide');
      node.append(el('span', 'lab-label', 'The Lab guide…'), el('span', 'lab-note', 'what each recipe does'));
    } else {
      node.classList.add(row.kind === 'proposal' ? 'lab-idea' : 'lab-recipe');
      node.dataset.prompt = row.prompt ?? '';
      if (row.group) node.dataset.group = '1';
      node.append(el('span', 'lab-label', row.label), el('span', 'lab-note', row.note));
    }
    menu.appendChild(node);
    rows.push(node);
    return node;
  };

  addRow({ kind: 'guide' });
  menu.appendChild(el('hr'));
  for (const row of bakedRecipes()) addRow(row);

  const proposals = proposeActions();
  if (proposals.length) {
    menu.appendChild(el('hr'));
    const heading = el('div', 'lab-heading', 'Suggested for your tabs');
    menu.appendChild(heading);
    for (const row of proposals) addRow(row);
  }

  // free-form composer
  menu.appendChild(el('hr'));
  const form = el('form', 'lab-ask');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'labInput';
  input.className = 'input';
  input.placeholder = 'Ask for anything: close all gmail tabs…';
  input.autocomplete = 'off';
  const submit = el('button', 'btn btn-primary btn-small', 'Run') as HTMLButtonElement;
  submit.type = 'submit';
  form.append(input, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void runPrompt(input.value);
  });
  menu.appendChild(form);
}

function light(index: number): void {
  current = Math.max(0, Math.min(index, rows.length - 1));
  rows.forEach((row, i) => row.classList.toggle('is-current', i === current));
}

export function openLab(): void {
  buildMenu();
  const menu = document.getElementById('labmenu');
  const btn = document.getElementById('lab');
  if (!menu) return;
  menu.classList.remove('is-closing');
  menu.classList.add('is-open');
  btn?.setAttribute('aria-expanded', 'true');
  open = true;
  light(0);
  document.getElementById('labInput')?.focus();
}

export function closeLab(): void {
  const menu = document.getElementById('labmenu');
  const btn = document.getElementById('lab');
  if (!menu) return;
  menu.classList.remove('is-open');
  menu.classList.add('is-closing');
  btn?.setAttribute('aria-expanded', 'false');
  open = false;
  window.setTimeout(() => menu.classList.remove('is-closing'), 150);
}

export function toggleLab(): void {
  if (open) closeLab();
  else openLab();
}

export function labIsOpen(): boolean {
  return open;
}

/** Move the highlight with the arrow keys; Enter activates. */
export function moveLab(delta: number): void {
  light(current + delta);
}

export async function activateCurrentRow(): Promise<void> {
  const row = rows[current];
  if (!row) return;
  await runRow(row);
}

async function runRow(row: HTMLElement): Promise<void> {
  if (row.classList.contains('lab-guide')) {
    showToast('The Lab runs one of these, or anything you type. Nothing changes until you approve.', 'success');
    return;
  }
  await runPrompt(row.dataset.prompt || '', row.dataset.group === '1');
}

/** Run a recipe (prompt) or open the editable grouping preview. */
export async function runPrompt(prompt: string, group = false): Promise<void> {
  if (!state.settings.apiKey) {
    const { showSettingsModal } = await import('./modals.js');
    showSettingsModal();
    return;
  }
  closeLab();
  if (group) {
    setCard('Grouping tabs', 'reading your tabs…', 'Review the groups, drag or remove tabs, then create them.');
    const { handleAIOrganize } = await import('./collections.js');
    await handleAIOrganize();
    clearCard();
    return;
  }
  const text = prompt.trim();
  if (!text) return;
  setCard(text, 'planning…', 'You will see the plan before anything runs.');
  try {
    const { runPlan } = await import('./ai.js');
    await runPlan(text);
  } finally {
    clearCard();
  }
}

/** The card above the button that reports on a pass, as Write On's Lab does. */
export function setCard(name: string, stateText: string, hint: string): void {
  const card = document.getElementById('labcard');
  if (!card) return;
  card.hidden = false;
  const n = card.querySelector('.lab-card-name');
  const s = card.querySelector('.lab-card-state');
  const h = card.querySelector('.lab-card-hint');
  if (n) n.textContent = name;
  if (s) s.textContent = stateText;
  if (h) h.textContent = hint;
}

export function clearCard(): void {
  const card = document.getElementById('labcard');
  if (card) card.hidden = true;
}

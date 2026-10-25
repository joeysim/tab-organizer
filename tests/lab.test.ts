/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

function seedDom() {
  document.body.innerHTML = `
    <button id="lab" aria-expanded="false"></button>
    <div id="labcard" hidden><p><span class="lab-card-name"></span><span class="lab-card-state"></span></p><p class="lab-card-hint"></p></div>
    <div id="labmenu"></div>
  `;
}

function tab(id: number, url: string, groupId = -1, title = 't' + id) {
  return { id, title, url, groupId, groupName: null, groupColor: null, favIconUrl: '', windowId: 1, index: id, active: false, pinned: false };
}

async function setup(tabs: unknown[]) {
  seedDom();
  vi.resetModules();
  const chromeMock = {
    runtime: { sendMessage: vi.fn(async () => ({ success: true })) },
    storage: { sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
  };
  (globalThis as unknown as Record<string, unknown>).chrome = chromeMock as never;
  const { state } = await import('../src/newtab/app/state.js');
  state.tabs = tabs as never;
  state.settings = { apiKey: 'k', darkMode: false, aiProvider: 'lunaroute' };
  const lab = await import('../src/newtab/app/lab.js');
  return { lab, state };
}

describe('The Lab', () => {
  beforeEach(() => vi.useRealTimers());

  test('offers guide + baked recipes when nothing is worth proposing', async () => {
    const { lab } = await setup([tab(1, 'https://a.com'), tab(2, 'https://b.com')]);
    lab.openLab();
    const labels = [...document.querySelectorAll('.lab-row .lab-label')].map((n) => n.textContent);
    expect(labels[0]).toBe('The Lab guide…');
    expect(labels).toContain('Group tabs by project');
    expect(labels).toContain('Close duplicate tabs');
    expect(labels).toContain('Save this session');
  });

  test('proposes closing duplicates from the actual tabs', async () => {
    const { lab } = await setup([
      tab(1, 'https://mail.google.com/x'),
      tab(2, 'https://mail.google.com/x'),
      tab(3, 'https://mail.google.com/x'),
    ]);
    const proposals = lab.proposeActions();
    const dupe = proposals.find((p) => p.label.includes('duplicate'));
    expect(dupe).toBeDefined();
    expect(dupe!.label).toBe('Close 2 duplicate tabs');
  });

  test('proposes a busy host only at 4+ tabs', async () => {
    const three = await setup([1, 2, 3].map((i) => tab(i, `https://figma.com/f${i}`)));
    expect(three.lab.proposeActions().some((p) => p.label.includes('figma.com'))).toBe(false);

    const four = await setup([1, 2, 3, 4].map((i) => tab(i, `https://figma.com/f${i}`)));
    const busy = four.lab.proposeActions().find((p) => p.label.includes('figma.com'));
    expect(busy).toBeDefined();
    expect(busy!.label).toBe('Close 4 tabs on figma.com');
  });

  test('proposes organizing when 5+ tabs are ungrouped', async () => {
    const { lab } = await setup([1, 2, 3, 4, 5].map((i) => tab(i, `https://site${i}.com`)));
    expect(lab.proposeActions().some((p) => p.label === 'Organize 5 ungrouped tabs')).toBe(true);
  });

  test('proposals are capped at three', async () => {
    const { lab } = await setup([
      ...Array.from({ length: 6 }, (_, i) => tab(i + 1, 'https://same.com/page')),
      ...Array.from({ length: 5 }, (_, i) => tab(100 + i, `https://busy.com/p${i}`)),
    ]);
    expect(lab.proposeActions().length).toBeLessThanOrEqual(3);
  });

  test('opens, closes and reports aria-expanded', async () => {
    const { lab } = await setup([tab(1, 'https://a.com')]);
    lab.openLab();
    expect(document.getElementById('labmenu')!.classList.contains('is-open')).toBe(true);
    expect(document.getElementById('lab')!.getAttribute('aria-expanded')).toBe('true');
    expect(lab.labIsOpen()).toBe(true);
    lab.closeLab();
    expect(lab.labIsOpen()).toBe(false);
    expect(document.getElementById('lab')!.getAttribute('aria-expanded')).toBe('false');
  });

  test('arrow keys move the highlight and stop at the ends', async () => {
    const { lab } = await setup([tab(1, 'https://a.com')]);
    lab.openLab();
    const current = () => document.querySelector('.lab-row.is-current .lab-label')?.textContent;
    expect(current()).toBe('The Lab guide…');
    lab.moveLab(1);
    expect(current()).toBe('Group tabs by project');
    lab.moveLab(1);
    expect(current()).toBe('Close duplicate tabs');
    lab.moveLab(-5);
    expect(current()).toBe('The Lab guide…');
    lab.moveLab(99);
    expect(current()).toBe('Save this session');
  });

  test('card reports state and clears', async () => {
    const { lab } = await setup([]);
    lab.setCard('close all gmail tabs', 'planning…', 'You will see the plan first.');
    const card = document.getElementById('labcard')!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.lab-card-name')!.textContent).toBe('close all gmail tabs');
    expect(card.querySelector('.lab-card-state')!.textContent).toBe('planning…');
    lab.clearCard();
    expect(card.hidden).toBe(true);
  });

  test('free-form composer submits and closes the lab', async () => {
    const { lab } = await setup([tab(1, 'https://a.com')]);
    lab.openLab();
    const input = document.getElementById('labInput') as HTMLInputElement;
    input.value = 'close all gmail tabs';
    const form = document.querySelector('.lab-ask') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(lab.labIsOpen()).toBe(false);
  });
});

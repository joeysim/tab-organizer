/**
 * @vitest-environment jsdom
 * AI preview modal: rendering + inline editing (move / remove / rename).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

function installChrome() {
  const mock = {
    runtime: { sendMessage: vi.fn(async () => ({ success: true })) },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }, sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
    tabs: { onCreated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
  };
  (globalThis as unknown as Record<string, unknown>).chrome = mock as unknown as typeof chrome;
  return mock;
}

function seedDom() {
  document.body.innerHTML = `
    <div id="modalOverlay"></div>
    <div class="modal modal-xl" id="aiPreviewModal" style="display:none">
      <div class="modal-header"><p id="aiPreviewSummary"></p></div>
      <div class="ai-progress" id="aiProgress"></div>
      <div class="modal-body"><div id="aiPreviewContent"></div></div>
      <div class="modal-footer"><button id="applyAiBtn" disabled></button></div>
    </div>
  `;
}

const TABS = [
  { id: 1, title: 'GitHub repo', url: 'https://github.com/a', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 0, active: false, pinned: false },
  { id: 2, title: 'GitHub pulls', url: 'https://github.com/b', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 1, active: false, pinned: false },
  { id: 3, title: 'Figma design', url: 'https://figma.com/x', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 2, active: false, pinned: false },
  { id: 4, title: 'Figma proto', url: 'https://figma.com/y', groupId: -1, groupName: null, groupColor: null, windowId: 1, index: 3, active: false, pinned: false },
];

async function setup() {
  installChrome();
  seedDom();
  vi.resetModules();
  const { state } = await import('../src/newtab/app/state.js');
  state.tabs = TABS as never;
  const mod = await import('../src/newtab/app/collections.js');
  return { mod, state };
}

describe('AI preview modal', () => {
  beforeEach(() => { vi.useRealTimers(); });

  test('renders groups, enables apply, shows summary', async () => {
    const { mod } = await setup();
    mod.renderAIPreview({ groups: [
      { name: 'GitHub', color: 'blue', tabs: [1, 2] },
      { name: 'Figma', color: 'purple', tabs: [3, 4] },
    ] });
    expect(document.querySelectorAll('.ai-group-preview')).toHaveLength(2);
    expect(document.getElementById('aiPreviewSummary')!.textContent).toContain('2 groups · 4 tabs');
    const apply = document.getElementById('applyAiBtn') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    expect(apply.textContent).toBe('Create 2 groups');
  });

  test('remove (×) takes a tab out of its group', async () => {
    const { mod } = await setup();
    mod.renderAIPreview({ groups: [{ name: 'GitHub', color: 'blue', tabs: [1, 2] }] });
    const group = document.querySelector('.ai-group-preview') as HTMLElement;
    const removes = group.querySelectorAll('.ai-group-tab-remove');
    expect(removes).toHaveLength(2);
    (removes[0] as HTMLButtonElement).click();
    const remaining = document.querySelectorAll('.ai-group-preview .ai-group-tab');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('GitHub pulls');
    // the removed tab lands in Ungrouped
    expect(document.querySelectorAll('.ai-ungrouped .ai-group-tab')).toHaveLength(3); // tabs 3,4 + the removed tab 1
    const apply = document.getElementById('applyAiBtn') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
  });

  test('dropping a tab on Ungrouped removes it from its group', async () => {
    const { mod } = await setup();
    mod.renderAIPreview({ groups: [{ name: 'GitHub', color: 'blue', tabs: [1, 2] }] });
    const source = document.querySelector('.ai-group-preview [data-tab-id="1"]') as HTMLElement;
    const zone = document.querySelector('.ai-ungrouped') as HTMLElement;

    const store: Record<string, string> = {};
    const dt = {
      setData: (k: string, v: string) => { store[k] = v; },
      getData: (k: string) => store[k] ?? '',
      effectAllowed: '', dropEffect: '',
    } as unknown as DataTransfer;
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: dt });
    source.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: dt });
    zone.dispatchEvent(drop);

    const inGroup = Array.from(document.querySelectorAll('.ai-group-preview [data-tab-id]')).map((t) => (t as HTMLElement).dataset.tabId);
    const inUngrouped = Array.from(document.querySelectorAll('.ai-ungrouped [data-tab-id]')).map((t) => (t as HTMLElement).dataset.tabId);
    expect(inGroup).toEqual(['2']);
    expect(inUngrouped).toContain('1');
  });

  test('drag and drop moves a tab between groups', async () => {
    const { mod } = await setup();
    mod.renderAIPreview({ groups: [
      { name: 'GitHub', color: 'blue', tabs: [1, 2] },
      { name: 'Figma', color: 'purple', tabs: [3, 4] },
    ] });
    const source = document.querySelector('.ai-group-preview [data-tab-id="1"]') as HTMLElement;
    const target = document.querySelectorAll('.ai-group-preview')[1] as HTMLElement;

    const store: Record<string, string> = {};
    const dt = {
      setData: (k: string, v: string) => { store[k] = v; },
      getData: (k: string) => store[k] ?? '',
      effectAllowed: '', dropEffect: '',
    } as unknown as DataTransfer;

    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: dt });
    source.dispatchEvent(dragStart);

    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: dt });
    target.dispatchEvent(drop);

    const groups = Array.from(document.querySelectorAll('.ai-group-preview')).map((g) =>
      Array.from(g.querySelectorAll('.ai-group-tab')).map((t) => (t as HTMLElement).dataset.tabId),
    );
    expect(groups[0]).toEqual(['2']);
    expect(groups[1]).toEqual(['3', '4', '1']);
  });

  test('group name is editable in place and renames the group', async () => {
    const { mod } = await setup();
    mod.renderAIPreview({ groups: [{ name: 'Old Name', color: 'blue', tabs: [1, 2] }] });
    const nameEl = document.querySelector('.ai-group-name') as HTMLElement;
    expect(nameEl.textContent).toBe('Old Name');

    nameEl.click();
    expect(nameEl.getAttribute('contenteditable')).toBe('true');

    nameEl.textContent = 'New Name';
    nameEl.dispatchEvent(new FocusEvent('blur'));
    expect(document.querySelector('.ai-group-name')!.textContent).toBe('New Name');
  });

  test('empty groups are not applied and disable the button when all empty', async () => {
    const mock = installChrome();
    seedDom();
    vi.resetModules();
    const { state } = await import('../src/newtab/app/state.js');
    state.tabs = TABS as never;
    const mod = await import('../src/newtab/app/collections.js');
    mod.renderAIPreview({ groups: [{ name: 'Only', color: 'blue', tabs: [1] }] });
    // remove the single tab
    (document.querySelector('.ai-group-preview .ai-group-tab-remove') as HTMLButtonElement).click();
    const apply = document.getElementById('applyAiBtn') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(apply.textContent).toBe('Nothing to apply');
    expect(mock.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

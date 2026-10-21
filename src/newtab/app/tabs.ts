// tabs.ts — selection + tab actions preserved from newtab.js
import { state } from './state.js';

export function getTabCard(tabId: number): HTMLElement | null {
  return document.querySelector(`[data-tab-id="${tabId}"]`);
}

export function updateCardSelectionState(card: Element, isSelected: boolean): void {
  card.classList.toggle('selected', isSelected);
  const checkbox = card.querySelector('.tab-checkbox') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = isSelected;
}

export function updateSelectionInfo(): void {
  const selectionInfo = document.getElementById('selectionInfo');
  const selectedCount = document.getElementById('selectedCount');
  if (!selectionInfo || !selectedCount) return;
  if (state.selectedTabs.size > 0) {
    selectionInfo.style.display = 'flex';
    selectedCount.textContent = `${state.selectedTabs.size} selected`;
  } else {
    selectionInfo.style.display = 'none';
  }
}

export function toggleTabSelection(tabId: number): void {
  if (state.selectedTabs.has(tabId)) state.selectedTabs.delete(tabId);
  else state.selectedTabs.add(tabId);

  const card = getTabCard(tabId);
  if (card) updateCardSelectionState(card, state.selectedTabs.has(tabId));
  updateSelectionInfo();
}

export function selectAllTabs(): void {
  document.querySelectorAll('.tab-card').forEach((card) => {
    if ((card as HTMLElement).style.display !== 'none') {
      const tabId = parseInt((card as HTMLElement).dataset.tabId || '0', 10);
      if (!isNaN(tabId)) {
        state.selectedTabs.add(tabId);
        updateCardSelectionState(card, true);
      }
    }
  });
  updateSelectionInfo();
}

export function deselectAllTabs(): void {
  state.selectedTabs.clear();
  document.querySelectorAll('.tab-card').forEach((card) => updateCardSelectionState(card, false));
  updateSelectionInfo();
}

export async function activateTab(tabId: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'activateTab', tabId });
}

export async function closeTab(tabId: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'closeTab', tabId });
  state.tabs = state.tabs.filter((t) => t.id !== tabId);
  state.selectedTabs.delete(tabId);
  // re-render deferred to caller / render module
  const { renderApp } = await import('./render.js');
  renderApp();
}

export async function closeSelectedTabs(): Promise<void> {
  if (state.selectedTabs.size === 0) return;
  const tabIds = Array.from(state.selectedTabs);
  await chrome.runtime.sendMessage({ action: 'closeTabs', tabIds });
  state.tabs = state.tabs.filter((t) => !state.selectedTabs.has(t.id));
  state.selectedTabs.clear();
  const { renderApp } = await import('./render.js');
  renderApp();
}

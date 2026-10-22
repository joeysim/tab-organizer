// groups.ts — group filter, color picker, changeGroupColor preserved from newtab.js
import { state } from './state.js';
import { showToast } from './toast.js';

// Returns null meaning "no filter — show all", otherwise a Set of visible tab ids
export function getVisibleTabIds(activeFilter: number | 'pinned' | null): Set<number> | null {
  if (activeFilter === null) return null;
  if (activeFilter === 'pinned') {
    return new Set(state.tabs.filter((t) => t.pinned).map((t) => t.id));
  }
  const group = state.groups.find((g) => g.id === activeFilter);
  if (group) return new Set(group.tabs.map((t) => t.id));
  // fallback: ungrouped with id -1 stored separately
  if (activeFilter === -1) {
    const ug = state.groups.find((g) => g.id === -1);
    if (ug) return new Set(ug.tabs.map((t) => t.id));
  }
  return null;
}

export function applyGroupFilter(): void {
  document.querySelectorAll('.group-item').forEach((el) => {
    const groupId = (el as HTMLElement).dataset.groupId;
    const isAllTabs = state.activeGroupFilter === null && !groupId;
    const isPinnedFilter = state.activeGroupFilter === 'pinned' && groupId === 'pinned';
    const isMatchingGroup =
      groupId !== undefined && groupId !== 'pinned' && parseInt(groupId) === (state.activeGroupFilter as number);
    el.classList.toggle('active', isAllTabs || isPinnedFilter || isMatchingGroup);
  });

  const visibleTabIds = getVisibleTabIds(state.activeGroupFilter);

  state.tabs.forEach((tab) => {
    const card = document.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLElement | null;
    if (card) {
      const isVisible = visibleTabIds === null || visibleTabIds.has(tab.id);
      card.style.display = isVisible ? '' : 'none';
    }
  });
}

export async function changeGroupColor(groupId: number, color: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ action: 'updateGroupColor', groupId, color });
    // reload tabs after color change
    const { loadTabs } = await import('./render.js');
    if (loadTabs) await loadTabs();
    showToast('Group color updated', 'success');
  } catch (error) {
    showToast('Failed to update color: ' + (error as Error).message, 'error');
  }
}

export function showGroupColorPicker(groupEl: HTMLElement, group: { id: number; color?: string }): void {
  const existing = document.querySelector('.group-color-dropdown');
  if (existing) existing.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'group-color-dropdown';

  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  colors.forEach((color) => {
    const option = document.createElement('button');
    option.className = 'color-option' + (group.color === color ? ' selected' : '');
    option.style.background = `var(--group-${color})`;
    option.addEventListener('click', async (e) => {
      e.stopPropagation();
      await changeGroupColor(group.id, color);
      dropdown.remove();
    });
    dropdown.appendChild(option);
  });

  groupEl.appendChild(dropdown);

  const closeDropdown = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && e.target !== groupEl.querySelector('.group-color-btn')) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 0);
}

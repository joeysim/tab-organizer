// keyboard.ts — setupKeyboardNavigation + updateFocusedCard preserved from newtab.js
import { toggleTabSelection, activateTab, closeTab, deselectAllTabs, selectAllTabs } from './tabs.js';
import { state } from './state.js';
import { showGroupModal, showCollectionModal, hideModal } from './modals.js';

function updateFocusedCard(cards: Element[], index: number): void {
  cards.forEach((card, i) => card.classList.toggle('focused', i === index));
  if (index >= 0 && cards[index]) {
    (cards[index] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export { updateFocusedCard };

export function setupKeyboardNavigation(): void {
  let focusedIndex = -1;

  document.addEventListener('keydown', (e) => {
    const cards = Array.from(document.querySelectorAll('.tab-card'));
    if (cards.length === 0) return;

    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
        focusedIndex = -1;
        updateFocusedCard(cards, focusedIndex);
      }
      return;
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay?.classList.contains('active')) {
      if (e.key === 'Escape') hideModal();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, cards.length - 1);
        updateFocusedCard(cards, focusedIndex);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        updateFocusedCard(cards, focusedIndex);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt((cards[focusedIndex] as HTMLElement).dataset.tabId || '0', 10);
          activateTab(tabId);
        }
        break;
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt((cards[focusedIndex] as HTMLElement).dataset.tabId || '0', 10);
          toggleTabSelection(tabId);
        }
        break;
      case 'x':
      case 'Delete':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cards.length) {
          const tabId = parseInt((cards[focusedIndex] as HTMLElement).dataset.tabId || '0', 10);
          closeTab(tabId);
          focusedIndex = Math.min(focusedIndex, cards.length - 2);
        }
        break;
      case '/':
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        deselectAllTabs();
        focusedIndex = -1;
        updateFocusedCard(cards, focusedIndex);
        break;
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          selectAllTabs();
        }
        break;
      case 'g':
        e.preventDefault();
        if (state.selectedTabs.size > 0) showGroupModal();
        break;
      case 'c':
        e.preventDefault();
        if (state.selectedTabs.size > 0) showCollectionModal();
        break;
    }
  });
}

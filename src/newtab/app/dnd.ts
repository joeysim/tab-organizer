// dnd.ts — dragState, checkDragIntersection, setupGlobalDragHandler preserved from newtab.js
export const dragState: { element: HTMLElement | null; offsetX: number; offsetY: number; width: number; height: number } = {
  element: null,
  offsetX: 0,
  offsetY: 0,
  width: 0,
  height: 0,
};

export function checkDragIntersection(e: { clientX: number; clientY: number }, targetEl: Element): number {
  if (!dragState.element) return 0;

  const dragLeft = e.clientX - dragState.offsetX;
  const dragTop = e.clientY - dragState.offsetY;
  const dragRight = dragLeft + dragState.width;
  const dragBottom = dragTop + dragState.height;

  const targetRect = targetEl.getBoundingClientRect();

  const overlapLeft = Math.max(dragLeft, targetRect.left);
  const overlapRight = Math.min(dragRight, targetRect.right);
  const overlapTop = Math.max(dragTop, targetRect.top);
  const overlapBottom = Math.min(dragBottom, targetRect.bottom);

  const overlapWidth = overlapRight - overlapLeft;
  const overlapHeight = overlapBottom - overlapTop;

  if (overlapWidth > 0 && overlapHeight > 0) return overlapWidth * overlapHeight;
  return 0;
}

export function setupGlobalDragHandler(): void {
  document.addEventListener('dragover', (e) => {
    if (!dragState.element) return;

    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));

    const dropTargets = document.querySelectorAll(
      '.group-item[data-group-id]:not([data-group-id="-1"]):not([data-group-id="pinned"]), .collection-item[data-collection-id]',
    );

    let bestTarget: Element | null = null;
    let bestOverlap = 0;

    dropTargets.forEach((target) => {
      const overlap = checkDragIntersection(e as unknown as { clientX: number; clientY: number }, target);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestTarget = target;
      }
    });

    if (bestTarget) bestTarget.classList.add('drag-over');
  });
}

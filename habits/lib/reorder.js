/**
 * Drag-to-reorder for table rows, using pointer events. Own implementation
 * because the app's sortable helper is no longer importable by modules.
 * Drag the grip handle; the row follows the pointer and the others make room.
 * Keyboard reordering is wired by the caller.
 */
export function makeReorderable(tbody, { handle, row, onEnd, signal }) {
  tbody.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest?.(handle);
    if (!grip || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const item = grip.closest(row);
    if (!item) return;
    event.preventDefault();
    grip.setPointerCapture?.(event.pointerId);
    item.classList.add('sortable-chosen');
    let moved = false;

    const onMove = (e) => {
      const rows = [...tbody.querySelectorAll(row)];
      const before = rows.indexOf(item);
      for (const other of rows) {
        if (other === item) continue;
        const box = other.getBoundingClientRect();
        const mid = box.top + box.height / 2;
        const idx = rows.indexOf(other);
        if (idx < before && e.clientY < mid) { tbody.insertBefore(item, other); moved = true; break; }
        if (idx > before && e.clientY > mid) { other.after(item); moved = true; break; }
      }
    };
    const finish = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      item.classList.remove('sortable-chosen');
      if (moved) onEnd?.();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  }, { signal });
}

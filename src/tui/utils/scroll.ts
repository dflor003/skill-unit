/**
 * Compute a new scroll offset so that the item at `cursor` stays within the
 * viewport. Top-down convention: `scrollOffset` is the index of the first
 * visible item.
 *
 * Rules:
 *   - If the cursor is above the current window, scroll up to land on it.
 *   - If the cursor is below, scroll down so the cursor sits on the last
 *     visible row.
 *   - Otherwise, return the existing offset, clamped to the valid range.
 */
export function ensureCursorVisible(
  cursor: number,
  scrollOffset: number,
  viewportHeight: number,
  totalItems: number
): number {
  if (viewportHeight <= 0 || totalItems <= 0) return 0;
  const maxOffset = Math.max(0, totalItems - viewportHeight);

  if (cursor < scrollOffset) {
    return Math.max(0, Math.min(cursor, maxOffset));
  }
  if (cursor >= scrollOffset + viewportHeight) {
    return Math.min(cursor - viewportHeight + 1, maxOffset);
  }
  return Math.max(0, Math.min(scrollOffset, maxOffset));
}

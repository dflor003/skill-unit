import { describe, it, expect } from 'vitest';
import { ensureCursorVisible } from '../../src/tui/utils/scroll.js';

describe('ensureCursorVisible', () => {
  describe('when the cursor is within the current viewport', () => {
    it('should keep the existing scroll offset', () => {
      // Arrange / Act
      const next = ensureCursorVisible(3, 0, 10, 20);

      // Assert
      expect(next).toBe(0);
    });
  });

  describe('when the cursor is below the viewport', () => {
    it('should scroll so the cursor lands on the last visible row', () => {
      // Arrange -- viewport shows items 0..9, cursor at 12
      // Act
      const next = ensureCursorVisible(12, 0, 10, 20);

      // Assert -- cursor should now be the last visible row → offset = 3
      expect(next).toBe(3);
    });
  });

  describe('when the cursor is above the viewport', () => {
    it('should scroll up to land the cursor on the first visible row', () => {
      // Arrange -- viewport at offset 10, cursor at 4
      // Act
      const next = ensureCursorVisible(4, 10, 10, 20);

      // Assert
      expect(next).toBe(4);
    });
  });

  describe('when the total is smaller than the viewport', () => {
    it('should return 0', () => {
      // Arrange / Act
      const next = ensureCursorVisible(2, 0, 20, 5);

      // Assert
      expect(next).toBe(0);
    });
  });

  describe('when the cursor is the last item', () => {
    it('should clamp scroll offset to max', () => {
      // Arrange -- 20 items, viewport of 10, cursor at last item (19)
      // Act
      const next = ensureCursorVisible(19, 0, 10, 20);

      // Assert -- offset so cursor is on last visible row (index 9 of viewport) → 10
      expect(next).toBe(10);
    });
  });

  describe('when totalItems is zero', () => {
    it('should return 0 regardless of cursor', () => {
      // Arrange / Act
      const next = ensureCursorVisible(5, 3, 10, 0);

      // Assert
      expect(next).toBe(0);
    });
  });

  describe('when viewport height is zero', () => {
    it('should return 0', () => {
      // Arrange / Act
      const next = ensureCursorVisible(5, 3, 0, 100);

      // Assert
      expect(next).toBe(0);
    });
  });

  describe('when the scroll offset is past the max after items shrink', () => {
    it('should clamp down to the new max', () => {
      // Arrange -- scrollOffset was valid for a longer list but items shrunk
      // viewport 10, totalItems 12 → max offset = 2, scrollOffset was 5
      // Cursor is still within valid range (index 4)
      // Act
      const next = ensureCursorVisible(4, 5, 10, 12);

      // Assert
      expect(next).toBe(2);
    });
  });
});

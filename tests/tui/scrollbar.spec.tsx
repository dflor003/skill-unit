import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Scrollbar } from '../../src/tui/components/scrollbar.js';

describe('Scrollbar', () => {
  describe('when content fits the viewport', () => {
    it('should render nothing', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar
          totalLines={10}
          visibleLines={20}
          scrollOffset={0}
          height={10}
        />
      );

      // Assert
      expect(lastFrame()!.trim()).toBe('');
    });
  });

  describe('when content overflows the viewport', () => {
    it('should render a track with thumb characters', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar
          totalLines={100}
          visibleLines={20}
          scrollOffset={0}
          height={10}
        />
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('\u2588');
      expect(output).toContain('\u2591');
    });
  });

  describe('when scrollOffset is 0 (at bottom)', () => {
    it('should place the thumb at the bottom of the track', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar
          totalLines={100}
          visibleLines={20}
          scrollOffset={0}
          height={10}
        />
      );
      const lines = lastFrame()!.split('\n');

      // Assert -- last non-empty line should be thumb
      const nonEmpty = lines.filter((l) => l.trim());
      expect(nonEmpty[nonEmpty.length - 1]).toContain('\u2588');
    });
  });

  describe('when scrollOffset is at maximum (at top)', () => {
    it('should place the thumb at the top of the track', () => {
      // Arrange -- maxOffset = 100 - 20 = 80
      const { lastFrame } = render(
        <Scrollbar
          totalLines={100}
          visibleLines={20}
          scrollOffset={80}
          height={10}
        />
      );
      const lines = lastFrame()!.split('\n');

      // Assert -- first non-empty line should be thumb
      const nonEmpty = lines.filter((l) => l.trim());
      expect(nonEmpty[0]).toContain('\u2588');
    });
  });

  describe('when thumb size is proportional', () => {
    it('should have a larger thumb when more content is visible', () => {
      // Arrange
      const { lastFrame: small } = render(
        <Scrollbar
          totalLines={200}
          visibleLines={10}
          scrollOffset={0}
          height={20}
        />
      );
      const { lastFrame: large } = render(
        <Scrollbar
          totalLines={40}
          visibleLines={10}
          scrollOffset={0}
          height={20}
        />
      );

      // Assert
      const countThumb = (s: string) => (s.match(/\u2588/g) || []).length;
      expect(countThumb(large()!)).toBeGreaterThan(countThumb(small()!));
    });
  });
});

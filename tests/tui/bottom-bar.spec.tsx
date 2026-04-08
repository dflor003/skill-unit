import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { BottomBar } from '../../src/tui/components/bottom-bar.js';

describe('BottomBar', () => {
  it('when a screen is active should highlight it', () => {
    // Act
    const { lastFrame } = render(<BottomBar activeScreen="dashboard" />);
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('ashboard');
    expect(output).toContain('uns');
    expect(output).toContain('tats');
    expect(output).toContain('ptions');
  });

  it('when runs screen is active should highlight it', () => {
    // Act
    const { lastFrame } = render(<BottomBar activeScreen="runs" />);
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('uns');
  });

  describe('when on runner screen with completed run', () => {
    it('should show Esc back hint', () => {
      // Act
      const { lastFrame } = render(
        <BottomBar
          activeScreen="runner"
          runStatus="complete"
          runViewMode="primary"
        />
      );

      // Assert
      expect(lastFrame()!).toContain('[Esc] back');
    });
  });

  describe('when on runner screen with active run in primary view', () => {
    it('should show run-mode hints instead of nav', () => {
      // Act
      const { lastFrame } = render(
        <BottomBar
          activeScreen="runner"
          runStatus="running"
          runViewMode="primary"
        />
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('Run in progress');
      expect(output).toContain('[Esc] cancel');
      expect(output).not.toContain('[D]');
    });
  });

  describe('when on runner screen with active run in split view', () => {
    it('should show split-mode hints', () => {
      // Act
      const { lastFrame } = render(
        <BottomBar
          activeScreen="runner"
          runStatus="running"
          runViewMode="split"
        />
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('[Esc] cancel');
      expect(output).toContain('focus');
      expect(output).toContain('maximize');
    });
  });

  describe('when on runner screen with complete run in primary view', () => {
    it('should show selection and re-run hints', () => {
      // Act
      const { lastFrame } = render(
        <BottomBar
          activeScreen="runner"
          runStatus="complete"
          runViewMode="primary"
        />
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('[Space] select');
      expect(output).toContain('[Enter] re-run');
      expect(output).toContain('[Esc] back');
    });
  });
});

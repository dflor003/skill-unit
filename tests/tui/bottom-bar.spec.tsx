import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { BottomBar } from '../../src/tui/components/bottom-bar.js';

describe('BottomBar', () => {
  it('when a screen is active should not use blue color on the active tab', () => {
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
});

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { BottomBar } from '../../src/tui/components/bottom-bar.js';
import {
  KeyboardRegistryProvider,
  useKeyboardShortcuts,
} from '../../src/tui/keyboard/index.js';

function renderWithProvider(ui: React.ReactElement) {
  return render(<KeyboardRegistryProvider>{ui}</KeyboardRegistryProvider>);
}

function HintProbe({
  bindings,
}: {
  bindings: Parameters<typeof useKeyboardShortcuts>[0];
}) {
  useKeyboardShortcuts(bindings);
  return null;
}

describe('BottomBar', () => {
  it('when a screen is active should highlight it in the nav row', () => {
    // Act
    const { lastFrame } = renderWithProvider(
      <BottomBar activeScreen="dashboard" />
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('ashboard');
    expect(output).toContain('uns');
    expect(output).toContain('tats');
    expect(output).toContain('ptions');
  });

  it('when runs screen is active should still render the nav row', () => {
    // Act
    const { lastFrame } = renderWithProvider(<BottomBar activeScreen="runs" />);

    // Assert
    expect(lastFrame()!).toContain('uns');
  });

  describe('when a run is in progress', () => {
    it('should show the running indicator', () => {
      // Act
      const { lastFrame } = renderWithProvider(
        <BottomBar activeScreen="runner" runStatus="running" />
      );

      // Assert
      expect(lastFrame()!).toContain('Run in progress');
    });
  });

  describe('when a component registers hints', () => {
    it('should render them in the bar', () => {
      // Arrange / Act
      const { lastFrame } = renderWithProvider(
        <>
          <HintProbe
            bindings={[
              { keys: 'space', hint: 'select', handler: () => {} },
              { keys: 'enter', hint: 'run', handler: () => {} },
            ]}
          />
          <BottomBar activeScreen="dashboard" />
        </>
      );

      // Assert
      const output = lastFrame()!;
      expect(output).toContain('[space] select');
      expect(output).toContain('[enter] run');
    });
  });

  describe('when a hint matches a global nav key', () => {
    it('should be filtered out of the context row', () => {
      // Arrange / Act: register a binding using the same display key as a
      // global nav letter. The context row should exclude it so the nav row
      // is the sole display for those keys.
      const { lastFrame } = renderWithProvider(
        <>
          <HintProbe
            bindings={[
              { keys: 'd', hint: 'should-not-appear', handler: () => {} },
            ]}
          />
          <BottomBar activeScreen="dashboard" />
        </>
      );

      // Assert
      expect(lastFrame()!).not.toContain('should-not-appear');
    });
  });
});

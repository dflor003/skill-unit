import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  KeyboardRegistryProvider,
  useKeyboardShortcuts,
  useKeyboardHints,
} from '../../../src/tui/keyboard/index.js';

function Probe({
  bindings,
  options,
}: {
  bindings: Parameters<typeof useKeyboardShortcuts>[0];
  options?: Parameters<typeof useKeyboardShortcuts>[1];
}) {
  useKeyboardShortcuts(bindings, options);
  return <Text>probe</Text>;
}

function HintsDisplay() {
  const hints = useKeyboardHints();
  return (
    <Text>{hints.map((h) => `[${h.displayKey}]${h.label}`).join(' ')}</Text>
  );
}

describe('useKeyboardShortcuts', () => {
  describe('when a component with a binding is rendered', () => {
    it('should fire the handler on matching input', () => {
      // Arrange
      const handler = vi.fn();
      const { stdin } = render(
        <KeyboardRegistryProvider>
          <Probe bindings={[{ keys: 'a', handler }]} />
        </KeyboardRegistryProvider>
      );

      // Act
      stdin.write('a');

      // Assert
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('when a component unmounts', () => {
    it('should stop receiving key events', () => {
      // Arrange
      const handler = vi.fn();
      function Harness({ show }: { show: boolean }) {
        return (
          <KeyboardRegistryProvider>
            {show ? <Probe bindings={[{ keys: 'a', handler }]} /> : null}
          </KeyboardRegistryProvider>
        );
      }
      const { stdin, rerender } = render(<Harness show={true} />);

      // Act
      rerender(<Harness show={false} />);
      stdin.write('a');

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('when a modal scope is mounted', () => {
    it('should shadow lower scopes', () => {
      // Arrange
      const lower = vi.fn();
      const modal = vi.fn();
      const { stdin } = render(
        <KeyboardRegistryProvider>
          <Probe bindings={[{ keys: 'a', handler: lower }]} />
          <Probe
            bindings={[{ keys: 'y', handler: modal }]}
            options={{ modal: true }}
          />
        </KeyboardRegistryProvider>
      );

      // Act
      stdin.write('a');
      stdin.write('y');

      // Assert
      expect(lower).not.toHaveBeenCalled();
      expect(modal).toHaveBeenCalledOnce();
    });
  });

  describe('when a textInput scope is topmost', () => {
    it('should swallow unmatched printable keys and invoke onText', () => {
      // Arrange -- sibling Probes register in JSX order (first = innermost
      // from React's effect perspective). Put the textInput scope first so
      // it becomes topmost.
      const appR = vi.fn();
      const onText = vi.fn();
      const { stdin } = render(
        <KeyboardRegistryProvider>
          <Probe bindings={[]} options={{ textInput: true, onText }} />
          <Probe bindings={[{ keys: 'r', handler: appR }]} />
        </KeyboardRegistryProvider>
      );

      // Act
      stdin.write('r');

      // Assert
      expect(appR).not.toHaveBeenCalled();
      expect(onText).toHaveBeenCalledWith('r');
    });
  });
});

describe('useKeyboardHints', () => {
  describe('when bindings with hints are registered', () => {
    it('should render their hints in the consumer', async () => {
      // Arrange
      const { lastFrame } = render(
        <KeyboardRegistryProvider>
          <Probe
            bindings={[
              { keys: 'q', hint: 'quit', handler: () => {} },
              { keys: 'space', hint: 'select', handler: () => {} },
            ]}
          />
          <Box>
            <HintsDisplay />
          </Box>
        </KeyboardRegistryProvider>
      );

      // Assert
      await vi.waitFor(() => {
        expect(lastFrame()!).toContain('[q]quit');
        expect(lastFrame()!).toContain('[space]select');
      });
    });
  });
});

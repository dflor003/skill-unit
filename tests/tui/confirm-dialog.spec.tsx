import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfirmDialog } from '../../src/tui/components/confirm-dialog.js';

describe('ConfirmDialog', () => {
  it('should render the message and yes/no options', () => {
    // Act
    const { lastFrame } = render(
      <ConfirmDialog
        message="Cancel the run?"
        onConfirm={() => {}}
        onDismiss={() => {}}
      />
    );

    // Assert
    const output = lastFrame()!;
    expect(output).toContain('Cancel the run?');
    expect(output).toContain('[Y]es');
    expect(output).toContain('[N]o');
  });

  describe('when Y is pressed', () => {
    it('should call onConfirm', () => {
      // Arrange
      const onConfirm = vi.fn();
      const { stdin } = render(
        <ConfirmDialog
          message="Cancel?"
          onConfirm={onConfirm}
          onDismiss={() => {}}
        />
      );

      // Act
      stdin.write('y');

      // Assert
      expect(onConfirm).toHaveBeenCalledOnce();
    });
  });

  describe('when N is pressed', () => {
    it('should call onDismiss', () => {
      // Arrange
      const onDismiss = vi.fn();
      const { stdin } = render(
        <ConfirmDialog
          message="Cancel?"
          onConfirm={() => {}}
          onDismiss={onDismiss}
        />
      );

      // Act
      stdin.write('n');

      // Assert
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('when an unrecognized key is pressed', () => {
    it('should not call either handler', () => {
      // Arrange
      const onConfirm = vi.fn();
      const onDismiss = vi.fn();
      const { stdin } = render(
        <ConfirmDialog
          message="Cancel?"
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      );

      // Act
      stdin.write('x');

      // Assert
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});

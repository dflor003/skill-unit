import { describe, it, expect, vi } from 'vitest';
import { KeyboardRegistry } from '../../../src/tui/keyboard/registry.js';
import type { Key } from 'ink';

const emptyKey: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
};

describe('KeyboardRegistry', () => {
  describe('when a single scope is registered', () => {
    it('should dispatch matching keystrokes to handlers', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const handler = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should not fire handlers whose keys do not match', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const handler = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('b', emptyKey);

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('when two scopes are stacked', () => {
    it('should prefer the first-registered scope (innermost in the React tree)', () => {
      // Arrange -- React effect order fires child effects before parent
      // effects, so in practice the inner (more specific) component
      // registers first. The registry mirrors this: first-registered wins.
      const registry = new KeyboardRegistry();
      const inner = vi.fn();
      const outer = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: inner }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: outer }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert
      expect(inner).toHaveBeenCalledOnce();
      expect(outer).not.toHaveBeenCalled();
    });

    it('should let non-conflicting keys coexist', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const appHandler = vi.fn();
      const screenHandler = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'd', handler: appHandler }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'space', handler: screenHandler }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('d', emptyKey);
      registry.dispatch(' ', emptyKey);

      // Assert
      expect(appHandler).toHaveBeenCalledOnce();
      expect(screenHandler).toHaveBeenCalledOnce();
    });
  });

  describe('when a binding is disabled', () => {
    it('should fall through to the next binding in the same scope', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const first = vi.fn();
      const second = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [
          { keys: 'escape', handler: first, enabled: false },
          { keys: 'escape', handler: second },
        ],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('', { ...emptyKey, escape: true });

      // Assert
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });

    it('should fall through to the next scope when the whole scope has no enabled match', () => {
      // Arrange -- first-registered (inner) is disabled for 'a'; second-
      // registered (outer) has an enabled handler. The disabled binding
      // should fall through.
      const registry = new KeyboardRegistry();
      const outer = vi.fn();
      const inner = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: inner, enabled: false }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: outer }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert
      expect(inner).not.toHaveBeenCalled();
      expect(outer).toHaveBeenCalledOnce();
    });
  });

  describe('when a modal scope is mounted', () => {
    it('should shadow all lower scopes', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const normal = vi.fn();
      const modal = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: normal }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'y', handler: modal }],
        modal: true,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);
      registry.dispatch('y', emptyKey);

      // Assert
      expect(normal).not.toHaveBeenCalled();
      expect(modal).toHaveBeenCalledOnce();
    });

    it('should swallow unmatched keys including specials', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const normal = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'tab', handler: normal }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'y', handler: () => {} }],
        modal: true,
        textInput: false,
      });

      // Act
      registry.dispatch('', { ...emptyKey, tab: true });

      // Assert
      expect(normal).not.toHaveBeenCalled();
    });
  });

  describe('when a textInput scope is topmost', () => {
    it('should swallow unmatched printable characters', () => {
      // Arrange -- textInput scope registers FIRST (innermost/topmost),
      // normal scope with 'r' binding registers SECOND (outer shell).
      const registry = new KeyboardRegistry();
      const appR = vi.fn();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [],
        modal: false,
        textInput: true,
        onText,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'r', handler: appR }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('r', emptyKey);

      // Assert
      expect(appR).not.toHaveBeenCalled();
      expect(onText).toHaveBeenCalledWith('r');
    });

    it('should let unmatched special keys fall through', () => {
      // Arrange -- textInput scope is topmost (registered first); outer
      // shell has a tab binding. Tab is not printable, so textInput does
      // not absorb it; dispatch falls through to the tab binding.
      const registry = new KeyboardRegistry();
      const appTab = vi.fn();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [],
        modal: false,
        textInput: true,
        onText,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'tab', handler: appTab }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('', { ...emptyKey, tab: true });

      // Assert
      expect(appTab).toHaveBeenCalledOnce();
      expect(onText).not.toHaveBeenCalled();
    });

    it('should still let the scope fire its own bindings for matching keys', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const handler = vi.fn();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'enter', handler }],
        modal: false,
        textInput: true,
        onText,
      });

      // Act
      registry.dispatch('', { ...emptyKey, return: true });

      // Assert
      expect(handler).toHaveBeenCalledOnce();
      expect(onText).not.toHaveBeenCalled();
    });

    it('should call onText only for printable characters', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [],
        modal: false,
        textInput: true,
        onText,
      });

      // Act
      registry.dispatch('a', emptyKey);
      registry.dispatch('', { ...emptyKey, upArrow: true });

      // Assert
      expect(onText).toHaveBeenCalledTimes(1);
      expect(onText).toHaveBeenCalledWith('a');
    });

    it('should not absorb printable characters when a non-textInput scope sits above', () => {
      // Arrange -- normal scope is innermost (registers first = topmost),
      // textInput scope is the outer shell (registers second = below).
      // Printables unmatched at the topmost normal scope should NOT bubble
      // into the textInput scope below.
      const registry = new KeyboardRegistry();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [],
        modal: false,
        textInput: true,
        onText,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert -- 'a' does not reach the lower textInput scope
      expect(onText).not.toHaveBeenCalled();
    });
  });

  describe('when a scope is unregistered', () => {
    it('should no longer receive dispatched events', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const id = Symbol();
      const handler = vi.fn();
      registry.register({
        id,
        bindings: [{ keys: 'a', handler }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.unregister(id);
      registry.dispatch('a', emptyKey);

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getVisibleHints', () => {
    it('should return hints from all enabled bindings in registration order', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'q', hint: 'quit', handler: () => {} }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'space', hint: 'select', handler: () => {} }],
        modal: false,
        textInput: false,
      });

      // Act
      const hints = registry.getVisibleHints();

      // Assert
      expect(hints).toEqual([
        { displayKey: 'q', label: 'quit' },
        { displayKey: 'space', label: 'select' },
      ]);
    });

    it('should omit bindings without a hint', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      registry.register({
        id: Symbol(),
        bindings: [
          { keys: 'escape', handler: () => {} },
          { keys: 'q', hint: 'quit', handler: () => {} },
        ],
        modal: false,
        textInput: false,
      });

      // Act
      const hints = registry.getVisibleHints();

      // Assert
      expect(hints).toEqual([{ displayKey: 'q', label: 'quit' }]);
    });

    it('should omit disabled bindings', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      registry.register({
        id: Symbol(),
        bindings: [
          { keys: 'enter', hint: 'run', handler: () => {}, enabled: false },
          { keys: 'space', hint: 'select', handler: () => {} },
        ],
        modal: false,
        textInput: false,
      });

      // Act
      const hints = registry.getVisibleHints();

      // Assert
      expect(hints).toEqual([{ displayKey: 'space', label: 'select' }]);
    });

    it('should use hintKey override when provided', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      registry.register({
        id: Symbol(),
        bindings: [
          {
            keys: ['left', 'right'],
            hintKey: 'L/R',
            hint: 'sessions',
            handler: () => {},
          },
        ],
        modal: false,
        textInput: false,
      });

      // Act
      const hints = registry.getVisibleHints();

      // Assert
      expect(hints).toEqual([{ displayKey: 'L/R', label: 'sessions' }]);
    });

    it('should return only the modal scope hints when a modal is active', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'q', hint: 'quit', handler: () => {} }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'y', hint: 'confirm', handler: () => {} }],
        modal: true,
        textInput: false,
      });

      // Act
      const hints = registry.getVisibleHints();

      // Assert
      expect(hints).toEqual([{ displayKey: 'y', label: 'confirm' }]);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on register and unregister', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const listener = vi.fn();
      registry.subscribe(listener);
      const id = Symbol();

      // Act
      registry.register({ id, bindings: [], modal: false, textInput: false });
      registry.unregister(id);

      // Assert
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});

# Keyboard Shortcut Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-component `useInput` handlers and hardcoded BottomBar hints with a declarative `useKeyboardShortcuts` hook backed by a shared registry. Supports normal, modal, and textInput scope modes; auto-derives BottomBar hints from active bindings.

**Architecture:** A React context (`KeyboardRegistryProvider`) owns a single registry of active scopes. Each component calls `useKeyboardShortcuts(bindings, options)` to register a scope on mount and unregister on unmount. A single root `useInput` inside the provider dispatches key events to the registry. BottomBar reads visible hints via `useKeyboardHints()`. See `docs/specs/2026-04-19-keyboard-shortcut-abstraction-design.md` for the full design.

**Tech Stack:** TypeScript, React 19, Ink 6, vitest, ink-testing-library.

---

## File Structure

**New files:**

- `src/tui/keyboard/types.ts` — `Binding`, `ScopeOptions`, internal `Scope` and `Hint` types.
- `src/tui/keyboard/match-key.ts` — `matchKey(spec, input, key)` and `isPrintable(input, key)` pure functions.
- `src/tui/keyboard/registry.ts` — `KeyboardRegistry` class. Holds scopes, runs dispatch, computes visible hints, notifies subscribers.
- `src/tui/keyboard/provider.tsx` — `<KeyboardRegistryProvider>` React context + root `useInput` wiring.
- `src/tui/keyboard/hooks.ts` — `useKeyboardShortcuts(bindings, options)` and `useKeyboardHints()`.
- `src/tui/keyboard/index.ts` — barrel export.
- `tests/tui/keyboard/match-key.spec.ts` — key-matching unit tests.
- `tests/tui/keyboard/registry.spec.ts` — registry dispatch + hint unit tests.
- `tests/tui/keyboard/hooks.spec.tsx` — React integration tests via ink-testing-library.

**Modified files (migration phase):**

- `src/tui/app.tsx` — wrap Ink tree in `<KeyboardRegistryProvider>`, replace global nav `useInput` with `useKeyboardShortcuts`.
- `src/tui/components/bottom-bar.tsx` — read hints from `useKeyboardHints()` (last, after all screens migrate).
- `src/tui/screens/dashboard.tsx` — `textInput: true` scope, revert Shift+R/Shift+S/Shift+O workarounds.
- `src/tui/screens/runs.tsx` — normal scope.
- `src/tui/screens/stats.tsx` — normal scope.
- `src/tui/screens/options.tsx` — normal scope + nested `textInput: true` scope during field edit.
- `src/tui/screens/runner.tsx` — two scopes (always-on + mode-specific).
- `src/tui/components/confirm-dialog.tsx` — `modal: true` scope.
- `src/tui/components/cleanup-dialog.tsx` — `modal: true` scope.

---

## Phase 1: Core Registry (pure, no React)

### Task 1: Create types

**Files:**

- Create: `src/tui/keyboard/types.ts`

- [ ] **Step 1: Write types file**

```typescript
import type { Key } from 'ink';

export type Binding = {
  keys: string | string[];
  handler: () => void;
  hint?: string;
  hintKey?: string;
  enabled?: boolean;
};

export type ScopeOptions = {
  modal?: boolean;
  textInput?: boolean;
  onText?: (ch: string) => void;
};

export type Scope = {
  id: symbol;
  bindings: ReadonlyArray<Binding>;
  modal: boolean;
  textInput: boolean;
  onText?: (ch: string) => void;
};

export type Hint = {
  displayKey: string;
  label: string;
};

export type { Key };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/keyboard/types.ts
git commit -m "feat: add keyboard registry types"
```

---

### Task 2: Key-matching pure function

**Files:**

- Create: `src/tui/keyboard/match-key.ts`
- Create: `tests/tui/keyboard/match-key.spec.ts`

- [ ] **Step 1: Write the failing tests**

File: `tests/tui/keyboard/match-key.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { matchKey, isPrintable } from '../../../src/tui/keyboard/match-key.js';
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

describe('matchKey', () => {
  describe('when matching a single letter', () => {
    it('should match the exact case', () => {
      // Act + Assert
      expect(matchKey('a', 'a', emptyKey)).toBe(true);
      expect(matchKey('A', 'A', emptyKey)).toBe(true);
    });

    it('should not match a different case', () => {
      // Act + Assert
      expect(matchKey('a', 'A', emptyKey)).toBe(false);
      expect(matchKey('A', 'a', emptyKey)).toBe(false);
    });
  });

  describe('when matching special keys', () => {
    it('should match up arrow', () => {
      // Act + Assert
      expect(matchKey('up', '', { ...emptyKey, upArrow: true })).toBe(true);
    });

    it('should match enter via return flag', () => {
      // Act + Assert
      expect(matchKey('enter', '', { ...emptyKey, return: true })).toBe(true);
    });

    it('should match space via input character', () => {
      // Act + Assert
      expect(matchKey('space', ' ', emptyKey)).toBe(true);
    });

    it('should match escape', () => {
      // Act + Assert
      expect(matchKey('escape', '', { ...emptyKey, escape: true })).toBe(true);
    });

    it('should match tab without shift', () => {
      // Act + Assert
      expect(matchKey('tab', '', { ...emptyKey, tab: true })).toBe(true);
      expect(matchKey('tab', '', { ...emptyKey, tab: true, shift: true })).toBe(
        false
      );
    });

    it('should match shift+tab only when shift is held', () => {
      // Act + Assert
      expect(
        matchKey('shift+tab', '', { ...emptyKey, tab: true, shift: true })
      ).toBe(true);
      expect(matchKey('shift+tab', '', { ...emptyKey, tab: true })).toBe(false);
    });
  });

  describe('when matching ctrl modifier', () => {
    it('should match ctrl+c', () => {
      // Act + Assert
      expect(matchKey('ctrl+c', 'c', { ...emptyKey, ctrl: true })).toBe(true);
    });

    it('should not match plain c', () => {
      // Act + Assert
      expect(matchKey('ctrl+c', 'c', emptyKey)).toBe(false);
    });

    it('should not match ctrl+c against plain c', () => {
      // Act + Assert
      expect(matchKey('c', 'c', { ...emptyKey, ctrl: true })).toBe(false);
    });
  });

  describe('when matching numeric digits', () => {
    it('should match 1 through 9', () => {
      // Act + Assert
      for (let i = 1; i <= 9; i++) {
        expect(matchKey(String(i), String(i), emptyKey)).toBe(true);
      }
    });
  });

  describe('when given an array of keys', () => {
    it('should match any key in the array', () => {
      // Act + Assert
      expect(matchKey(['y', 'Y'], 'y', emptyKey)).toBe(true);
      expect(matchKey(['y', 'Y'], 'Y', emptyKey)).toBe(true);
      expect(matchKey(['y', 'Y'], 'n', emptyKey)).toBe(false);
    });
  });
});

describe('isPrintable', () => {
  it('should return true for a printable letter', () => {
    // Act + Assert
    expect(isPrintable('a', emptyKey)).toBe(true);
    expect(isPrintable('Z', emptyKey)).toBe(true);
  });

  it('should return true for space', () => {
    // Act + Assert
    expect(isPrintable(' ', emptyKey)).toBe(true);
  });

  it('should return true for a digit', () => {
    // Act + Assert
    expect(isPrintable('7', emptyKey)).toBe(true);
  });

  it('should return false for empty input', () => {
    // Act + Assert
    expect(isPrintable('', emptyKey)).toBe(false);
  });

  it('should return false when ctrl is held', () => {
    // Act + Assert
    expect(isPrintable('c', { ...emptyKey, ctrl: true })).toBe(false);
  });

  it('should return false when meta is held', () => {
    // Act + Assert
    expect(isPrintable('c', { ...emptyKey, meta: true })).toBe(false);
  });

  it('should return false for arrow keys', () => {
    // Act + Assert
    expect(isPrintable('', { ...emptyKey, upArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, downArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, leftArrow: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, rightArrow: true })).toBe(false);
  });

  it('should return false for return, escape, tab, backspace, delete', () => {
    // Act + Assert
    expect(isPrintable('', { ...emptyKey, return: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, escape: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, tab: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, backspace: true })).toBe(false);
    expect(isPrintable('', { ...emptyKey, delete: true })).toBe(false);
  });

  it('should return true for shift+letter (capital letter)', () => {
    // Act + Assert
    expect(isPrintable('A', { ...emptyKey, shift: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tui/keyboard/match-key.spec.ts`
Expected: FAIL — module `match-key.js` does not exist.

- [ ] **Step 3: Write the implementation**

File: `src/tui/keyboard/match-key.ts`

```typescript
import type { Key } from 'ink';

function matchSingleKey(spec: string, input: string, key: Key): boolean {
  if (spec === 'up') return key.upArrow;
  if (spec === 'down') return key.downArrow;
  if (spec === 'left') return key.leftArrow;
  if (spec === 'right') return key.rightArrow;
  if (spec === 'enter') return key.return;
  if (spec === 'escape') return key.escape;
  if (spec === 'backspace') return key.backspace;
  if (spec === 'delete') return key.delete;
  if (spec === 'pageup') return key.pageUp;
  if (spec === 'pagedown') return key.pageDown;
  if (spec === 'tab') return key.tab && !key.shift;
  if (spec === 'shift+tab') return key.tab && key.shift;
  if (spec === 'space') return input === ' ';

  if (spec.startsWith('ctrl+')) {
    const letter = spec.slice(5);
    return key.ctrl && input === letter;
  }

  // Literal character (case-sensitive). Must not be accompanied by a modifier
  // so `ctrl+c` does not also fire a plain `c` binding.
  return input === spec && !key.ctrl && !key.meta;
}

export function matchKey(
  spec: string | string[],
  input: string,
  key: Key
): boolean {
  if (Array.isArray(spec)) {
    return spec.some((s) => matchSingleKey(s, input, key));
  }
  return matchSingleKey(spec, input, key);
}

export function isPrintable(input: string, key: Key): boolean {
  if (input.length === 0) return false;
  if (key.ctrl || key.meta) return false;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)
    return false;
  if (key.return || key.escape || key.tab || key.backspace || key.delete)
    return false;
  if (key.pageUp || key.pageDown) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tui/keyboard/match-key.spec.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui/keyboard/match-key.ts tests/tui/keyboard/match-key.spec.ts
git commit -m "feat: add keyboard key-matching function"
```

---

### Task 3: Registry dispatch logic

**Files:**

- Create: `src/tui/keyboard/registry.ts`
- Create: `tests/tui/keyboard/registry.spec.ts`

- [ ] **Step 1: Write the failing tests**

File: `tests/tui/keyboard/registry.spec.ts`

```typescript
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
    it('should prefer the most recently registered scope', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const lower = vi.fn();
      const upper = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: lower }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: upper }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert
      expect(upper).toHaveBeenCalledOnce();
      expect(lower).not.toHaveBeenCalled();
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
      // Arrange
      const registry = new KeyboardRegistry();
      const lower = vi.fn();
      const upper = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: lower }],
        modal: false,
        textInput: false,
      });
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'a', handler: upper, enabled: false }],
        modal: false,
        textInput: false,
      });

      // Act
      registry.dispatch('a', emptyKey);

      // Assert
      expect(upper).not.toHaveBeenCalled();
      expect(lower).toHaveBeenCalledOnce();
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
      // Arrange
      const registry = new KeyboardRegistry();
      const appR = vi.fn();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'r', handler: appR }],
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
      registry.dispatch('r', emptyKey);

      // Assert
      expect(appR).not.toHaveBeenCalled();
      expect(onText).toHaveBeenCalledWith('r');
    });

    it('should let unmatched special keys fall through', () => {
      // Arrange
      const registry = new KeyboardRegistry();
      const appTab = vi.fn();
      const onText = vi.fn();
      registry.register({
        id: Symbol(),
        bindings: [{ keys: 'tab', handler: appTab }],
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
            hintKey: '←→',
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
      expect(hints).toEqual([{ displayKey: '←→', label: 'sessions' }]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tui/keyboard/registry.spec.ts`
Expected: FAIL — module `registry.js` does not exist.

- [ ] **Step 3: Write the implementation**

File: `src/tui/keyboard/registry.ts`

```typescript
import type { Key } from 'ink';
import { matchKey, isPrintable } from './match-key.js';
import type { Hint, Scope } from './types.js';

export class KeyboardRegistry {
  private scopes: Scope[] = [];
  private listeners = new Set<() => void>();

  register(scope: Scope): void {
    this.scopes.push(scope);
    this.notify();
  }

  unregister(id: symbol): void {
    const idx = this.scopes.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.scopes.splice(idx, 1);
      this.notify();
    }
  }

  updateScope(id: symbol, next: Omit<Scope, 'id'>): void {
    const idx = this.scopes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    this.scopes[idx] = { id, ...next };
    this.notify();
  }

  dispatch(input: string, key: Key): void {
    const modalIdx = this.findLastModal();
    const candidates =
      modalIdx >= 0 ? [this.scopes[modalIdx]!] : [...this.scopes].reverse();

    for (const scope of candidates) {
      for (const binding of scope.bindings) {
        if (!matchKey(binding.keys, input, key)) continue;
        if (binding.enabled === false) continue;
        binding.handler();
        return;
      }

      // A textInput scope swallows unmatched printable characters at its
      // own boundary; it does not fall through to scopes below.
      if (scope.textInput && isPrintable(input, key)) {
        scope.onText?.(input);
        return;
      }
    }
  }

  getVisibleHints(): Hint[] {
    const modalIdx = this.findLastModal();
    const source = modalIdx >= 0 ? [this.scopes[modalIdx]!] : this.scopes;

    const hints: Hint[] = [];
    for (const scope of source) {
      for (const binding of scope.bindings) {
        if (!binding.hint) continue;
        if (binding.enabled === false) continue;
        const displayKey =
          binding.hintKey ??
          (Array.isArray(binding.keys) ? binding.keys[0]! : binding.keys);
        hints.push({ displayKey, label: binding.hint });
      }
    }
    return hints;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private findLastModal(): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i]!.modal) return i;
    }
    return -1;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tui/keyboard/registry.spec.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/tui/keyboard/registry.ts tests/tui/keyboard/registry.spec.ts
git commit -m "feat: add keyboard registry with dispatch and hint logic"
```

---

## Phase 2: React Integration

### Task 4: Provider, hooks, and barrel export

**Files:**

- Create: `src/tui/keyboard/provider.tsx`
- Create: `src/tui/keyboard/hooks.ts`
- Create: `src/tui/keyboard/index.ts`
- Create: `tests/tui/keyboard/hooks.spec.tsx`

- [ ] **Step 1: Write the failing integration tests**

File: `tests/tui/keyboard/hooks.spec.tsx`

```tsx
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
      // Arrange
      const appR = vi.fn();
      const onText = vi.fn();
      const { stdin } = render(
        <KeyboardRegistryProvider>
          <Probe bindings={[{ keys: 'r', handler: appR }]} />
          <Probe bindings={[]} options={{ textInput: true, onText }} />
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tui/keyboard/hooks.spec.tsx`
Expected: FAIL — module paths resolve but exports do not exist.

- [ ] **Step 3: Write the provider**

File: `src/tui/keyboard/provider.tsx`

```tsx
import React, { createContext, useContext, useRef } from 'react';
import { useInput } from 'ink';
import { KeyboardRegistry } from './registry.js';

const KeyboardRegistryContext = createContext<KeyboardRegistry | null>(null);

export function KeyboardRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const registryRef = useRef<KeyboardRegistry | null>(null);
  if (registryRef.current === null) {
    registryRef.current = new KeyboardRegistry();
  }
  const registry = registryRef.current;

  useInput((input, key) => {
    registry.dispatch(input, key);
  });

  return (
    <KeyboardRegistryContext.Provider value={registry}>
      {children}
    </KeyboardRegistryContext.Provider>
  );
}

export function useKeyboardRegistry(): KeyboardRegistry {
  const registry = useContext(KeyboardRegistryContext);
  if (!registry) {
    throw new Error(
      'useKeyboardRegistry must be used inside <KeyboardRegistryProvider>'
    );
  }
  return registry;
}
```

- [ ] **Step 4: Write the hooks**

File: `src/tui/keyboard/hooks.ts`

```typescript
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useKeyboardRegistry } from './provider.js';
import type { Binding, Hint, ScopeOptions } from './types.js';

export function useKeyboardShortcuts(
  bindings: Binding[],
  options?: ScopeOptions
): void {
  const registry = useKeyboardRegistry();
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) {
    idRef.current = Symbol('kb-scope');
  }

  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const id = idRef.current!;
    registry.register({
      id,
      bindings: bindingsRef.current,
      modal: optionsRef.current?.modal ?? false,
      textInput: optionsRef.current?.textInput ?? false,
      onText: optionsRef.current?.onText,
    });
    return () => {
      registry.unregister(id);
    };
  }, [registry]);

  useEffect(() => {
    registry.updateScope(idRef.current!, {
      bindings,
      modal: options?.modal ?? false,
      textInput: options?.textInput ?? false,
      onText: options?.onText,
    });
  });
}

export function useKeyboardHints(): Hint[] {
  const registry = useKeyboardRegistry();
  return useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.getVisibleHints(),
    () => registry.getVisibleHints()
  );
}
```

Note: `useSyncExternalStore` requires the same-reference snapshot when nothing changes, or it will tear. `getVisibleHints` currently allocates a new array every call. Step 5 addresses this.

- [ ] **Step 5: Add snapshot memoization to the registry**

Open `src/tui/keyboard/registry.ts`. Add a cached hints field and invalidate on mutations.

Replace the class body so `notify()` invalidates the cache and `getVisibleHints()` returns the cached array until invalidated:

```typescript
export class KeyboardRegistry {
  private scopes: Scope[] = [];
  private listeners = new Set<() => void>();
  private cachedHints: Hint[] | null = null;

  register(scope: Scope): void {
    this.scopes.push(scope);
    this.notify();
  }

  unregister(id: symbol): void {
    const idx = this.scopes.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.scopes.splice(idx, 1);
      this.notify();
    }
  }

  updateScope(id: symbol, next: Omit<Scope, 'id'>): void {
    const idx = this.scopes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const prev = this.scopes[idx]!;
    this.scopes[idx] = { id, ...next };
    if (!hintsEqual(prev, this.scopes[idx]!)) {
      this.notify();
    }
  }

  dispatch(input: string, key: Key): void {
    // (unchanged from Task 3)
    const modalIdx = this.findLastModal();
    const candidates =
      modalIdx >= 0 ? [this.scopes[modalIdx]!] : [...this.scopes].reverse();

    for (const scope of candidates) {
      for (const binding of scope.bindings) {
        if (!matchKey(binding.keys, input, key)) continue;
        if (binding.enabled === false) continue;
        binding.handler();
        return;
      }

      if (scope.textInput && isPrintable(input, key)) {
        scope.onText?.(input);
        return;
      }
    }
  }

  getVisibleHints(): Hint[] {
    if (this.cachedHints !== null) return this.cachedHints;
    const modalIdx = this.findLastModal();
    const source = modalIdx >= 0 ? [this.scopes[modalIdx]!] : this.scopes;

    const hints: Hint[] = [];
    for (const scope of source) {
      for (const binding of scope.bindings) {
        if (!binding.hint) continue;
        if (binding.enabled === false) continue;
        const displayKey =
          binding.hintKey ??
          (Array.isArray(binding.keys) ? binding.keys[0]! : binding.keys);
        hints.push({ displayKey, label: binding.hint });
      }
    }
    this.cachedHints = hints;
    return hints;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.cachedHints = null;
    for (const listener of this.listeners) listener();
  }

  private findLastModal(): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i]!.modal) return i;
    }
    return -1;
  }
}

function hintsEqual(a: Scope, b: Scope): boolean {
  if (a.modal !== b.modal) return false;
  if (a.bindings.length !== b.bindings.length) return false;
  for (let i = 0; i < a.bindings.length; i++) {
    const ba = a.bindings[i]!;
    const bb = b.bindings[i]!;
    if (ba.hint !== bb.hint) return false;
    if (ba.hintKey !== bb.hintKey) return false;
    if ((ba.enabled === false) !== (bb.enabled === false)) return false;
    const keyA = Array.isArray(ba.keys) ? ba.keys[0] : ba.keys;
    const keyB = Array.isArray(bb.keys) ? bb.keys[0] : bb.keys;
    if (keyA !== keyB) return false;
  }
  return true;
}
```

- [ ] **Step 6: Write the barrel export**

File: `src/tui/keyboard/index.ts`

```typescript
export { KeyboardRegistryProvider, useKeyboardRegistry } from './provider.js';
export { useKeyboardShortcuts, useKeyboardHints } from './hooks.js';
export type { Binding, ScopeOptions, Hint } from './types.js';
```

- [ ] **Step 7: Run all keyboard tests**

Run: `npm test -- tests/tui/keyboard/`
Expected: all tests pass.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/tui/keyboard/ tests/tui/keyboard/hooks.spec.tsx
git commit -m "feat: add KeyboardRegistryProvider, useKeyboardShortcuts, useKeyboardHints"
```

---

## Phase 3: Migration

**Migration contract:** each screen migration is one task. Each task:

1. Adds a `useKeyboardShortcuts` call with equivalent behavior to the existing `useInput`.
2. Deletes the legacy `useInput` block in the same commit (no double-firing).
3. Preserves the existing `onContextHintsChange` callback for now; BottomBar still reads from it until Task 13.
4. Runs that screen's existing spec tests to verify behavior preserved.

Pass existing behavior through unchanged. Do not refactor unrelated code.

---

### Task 5: Wire `KeyboardRegistryProvider` into `app.tsx`

**Files:**

- Modify: `src/tui/app.tsx`

- [ ] **Step 1: Import the provider**

At the top of `src/tui/app.tsx`, add:

```typescript
import { KeyboardRegistryProvider } from './keyboard/index.js';
```

- [ ] **Step 2: Wrap the existing App return value**

Locate the top-level JSX returned by the `App` component. Wrap it in `<KeyboardRegistryProvider>`. If `App` currently returns `<Box ...>...</Box>` as the root, wrap that Box in the provider:

```tsx
return (
  <KeyboardRegistryProvider>
    <Box ...>
      {/* existing children */}
    </Box>
  </KeyboardRegistryProvider>
);
```

Do NOT modify the existing `useInput` call in `App` yet. The provider's root `useInput` and App's existing `useInput` will coexist in this step.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all existing tests pass. No behavior should have changed.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat: wire KeyboardRegistryProvider into app shell"
```

---

### Task 6: Migrate App global navigation

**Files:**

- Modify: `src/tui/app.tsx`

Current `useInput` block handles D/R/S/O/Tab/Shift+Tab/Q/Ctrl+C/Esc/Backspace. Reference: `src/tui/app.tsx:201-245`.

- [ ] **Step 1: Add the useKeyboardShortcuts import**

```typescript
import {
  KeyboardRegistryProvider,
  useKeyboardShortcuts,
} from './keyboard/index.js';
```

- [ ] **Step 2: Extract the app-level keybindings**

Inside the `App` component body, replace the entire existing `useInput(...)` block with a `useKeyboardShortcuts` call. The new call must live inside the component that is a descendant of the provider (not in `App` itself if `App` IS the provider owner — since `App` renders `<KeyboardRegistryProvider>`, the `useKeyboardShortcuts` hook inside `App` won't find the provider).

**Fix:** split `App` into an outer shell that renders the provider and an inner component that consumes it.

Restructure the file so:

```tsx
export function App(props: AppProps) {
  return (
    <KeyboardRegistryProvider>
      <AppInner {...props} />
    </KeyboardRegistryProvider>
  );
}

function AppInner(props: AppProps) {
  // ...all existing App body here...
}
```

Move the existing `useInput` block (and all other hooks/state) into `AppInner`.

- [ ] **Step 3: Replace the useInput block inside AppInner**

Delete the current `useInput((input, key) => { ... })` block (lines 201-245 in the pre-migration file).

Add (in its place, inside `AppInner`):

```tsx
const isRunnerActive = screen === 'runner' && runState.status === 'running';
const isModalOrEditing =
  showCancelDialog || showCleanupDialog || isEditingField;

useKeyboardShortcuts([
  {
    keys: ['d', 'D'],
    handler: () => setScreen('dashboard'),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: ['r', 'R'],
    handler: () => setScreen('runs'),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: ['s', 'S'],
    handler: () => setScreen('stats'),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: ['o', 'O'],
    handler: () => setScreen('options'),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: 'tab',
    handler: () => cycleScreen(1),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: 'shift+tab',
    handler: () => cycleScreen(-1),
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  {
    keys: ['q', 'Q'],
    handler: exit,
    enabled: !isModalOrEditing && !isRunnerActive,
  },
  { keys: 'ctrl+c', handler: exit },
  // Escape: during active run → open cancel dialog
  {
    keys: 'escape',
    handler: () => setShowCancelDialog(true),
    enabled: isRunnerActive && !isModalOrEditing,
  },
  // Escape: idle runner or back-able screen
  {
    keys: 'escape',
    handler: () => setScreen(previousScreen),
    enabled: screen === 'runner' && !isRunnerActive && !isModalOrEditing,
  },
  // Backspace: back from runner (idle only)
  {
    keys: ['backspace', 'delete'],
    handler: () => setScreen(previousScreen),
    enabled: screen === 'runner' && !isRunnerActive && !isModalOrEditing,
  },
]);
```

Where `cycleScreen(delta)` is a local helper:

```tsx
const cycleScreen = (delta: 1 | -1) => {
  setScreen((prev) => {
    const idx = NAV_SCREENS.indexOf(prev);
    return NAV_SCREENS[
      (idx + delta + NAV_SCREENS.length) % NAV_SCREENS.length
    ]!;
  });
};
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all existing app tests pass.

- [ ] **Step 5: Smoke test the TUI manually**

Run: `npm run su`
Verify: D/R/S/O, Tab, Shift+Tab, Q still navigate. Esc/Backspace still go back from Runner. Ctrl+C still exits cleanly.
Expected: behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat: migrate App global navigation to useKeyboardShortcuts"
```

---

### Task 7: Migrate Dashboard (textInput scope + revert Shift workarounds)

**Files:**

- Modify: `src/tui/screens/dashboard.tsx`
- Modify: `src/tui/app.tsx` (if Shift+R/S/O workarounds live there — they don't; the workaround is that App binds uppercase letters. After this task Dashboard absorbs lowercase letters while typing, so lowercase App bindings are safe again.)

Reference: `src/tui/screens/dashboard.tsx:238-322`.

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the useInput block**

Delete the entire `useInput((input, key) => { ... })` block at lines 238-322.

Add, just after the existing ref declarations:

```tsx
const searching = queryRef.current.length > 0;

useKeyboardShortcuts(
  [
    { keys: 'up', handler: () => setCursor((c) => Math.max(0, c - 1)) },
    {
      keys: 'down',
      handler: () =>
        setCursor((c) => Math.min(visibleRef.current.length - 1, c + 1)),
    },
    {
      keys: 'enter',
      hint: 'run',
      enabled: selectedRef.current.size > 0,
      handler: () => {
        const toRun = testsInView.filter((t) => selectedRef.current.has(t.key));
        if (toRun.length > 0) onRunTestsRef.current(toRun);
      },
    },
    {
      keys: 'backspace',
      handler: () => setQuery((q) => q.slice(0, -1)),
      enabled: searching,
    },
    { keys: 'escape', handler: () => setQuery(''), enabled: searching },
    {
      keys: 'space',
      hint: 'select',
      handler: () => toggleSelection(),
      enabled: !searching,
    },
    {
      keys: 'a',
      hint: 'select all',
      handler: () => selectAllVisible(),
      enabled: !searching,
    },
    {
      keys: 'A',
      hint: 'select group',
      handler: () => selectGroup(),
      enabled: !searching,
    },
  ],
  {
    textInput: true,
    onText: (ch) => setQuery((q) => q + ch),
  }
);
```

Extract the three selection helpers (`toggleSelection`, `selectAllVisible`, `selectGroup`) from the deleted `useInput` block into local `const` functions above the `useKeyboardShortcuts` call. Keep their logic identical to the original.

- [ ] **Step 3: Verify the App's global nav was never reverted**

Check `src/tui/app.tsx` — global nav keys are `['d', 'D']`, `['r', 'R']`, etc. They already include lowercase. No change needed; Dashboard's textInput scope now absorbs lowercase letters when the query is non-empty (actually — always, because `textInput: true` is the scope mode, not conditional). Test scenario:

- Query empty, press `r` → binding `a` disabled (but that's `a`, not `r`); no match in Dashboard scope → falls back to textInput → `onText('r')` fires → query becomes 'r'. App's `r` binding never sees it.

This is the desired behavior (per spec — lowercase `r` in Dashboard adds to search instead of navigating).

- [ ] **Step 4: Run the Dashboard spec**

Run: `npm test -- tests/tui/dashboard.spec.tsx`
Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Smoke test**

Run: `npm run su`
Verify:

- Arrow keys still move cursor.
- Typing letters fills the search query.
- Space toggles selection only when query is empty.
- Esc clears search.
- Enter runs selected tests.
- **New:** Pressing lowercase `r` or `s` or `o` while Dashboard is active no longer navigates; it adds to search.

- [ ] **Step 7: Commit**

```bash
git add src/tui/screens/dashboard.tsx
git commit -m "feat: migrate Dashboard to useKeyboardShortcuts with textInput scope"
```

---

### Task 8: Migrate Runs screen

**Files:**

- Modify: `src/tui/screens/runs.tsx`

Reference: `src/tui/screens/runs.tsx:58-74`.

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the useInput block**

Delete the `useInput((input, key) => { ... })` block at lines 58-74.

Add:

```tsx
useKeyboardShortcuts([
  {
    keys: 'up',
    enabled: runs.length > 0,
    handler: () => setCursor((c) => Math.max(0, c - 1)),
  },
  {
    keys: 'down',
    enabled: runs.length > 0,
    handler: () => setCursor((c) => Math.min(runs.length - 1, c + 1)),
  },
  {
    keys: 'delete',
    hint: 'delete',
    enabled: runs.length > 0,
    handler: () => {
      const run = runs[cursor];
      if (run) onDeleteRun(run.id);
    },
  },
  {
    keys: ['c', 'C'],
    hint: 'cleanup',
    enabled: runs.length > 0,
    handler: () => onCleanup(),
  },
  {
    keys: 'enter',
    hint: 'view',
    enabled: runs.length > 0,
    handler: () => {
      const run = runs[cursor];
      if (run) onViewRun(run);
    },
  },
]);
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/tui/runs.spec.tsx`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/tui/screens/runs.tsx
git commit -m "feat: migrate Runs screen to useKeyboardShortcuts"
```

---

### Task 9: Migrate Stats screen

**Files:**

- Modify: `src/tui/screens/stats.tsx`

Reference: `src/tui/screens/stats.tsx:88-95`.

- [ ] **Step 1: Add the import and replace the block**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

Delete the `useInput(...)` block and replace with:

```tsx
useKeyboardShortcuts([
  {
    keys: ['s', 'S'],
    hint: 'cycle sort',
    handler: () =>
      setSortField((current) => {
        const idx = SORT_FIELDS.indexOf(current);
        return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length]!;
      }),
  },
]);
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/tui/stats.spec.tsx`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/stats.tsx
git commit -m "feat: migrate Stats screen to useKeyboardShortcuts"
```

---

### Task 10: Migrate Options screen

**Files:**

- Modify: `src/tui/screens/options.tsx`
- Modify: `src/tui/app.tsx` (remove `isEditingField` state if no longer needed — deferred to Task 14 cleanup)

Reference: `src/tui/screens/options.tsx:183-213`.

The existing flow: Options reports its editing state to App via `onEditingChange` so App disables global nav. In the new flow, Options mounts a `textInput: true` nested scope only during field editing; App's global nav is shadowed by the textInput scope automatically (for printable characters). Specials like Tab still fall through — that's a slight behavior change from today, where Tab was blocked entirely during editing. Preserve existing behavior by adding `tab` and `shift+tab` as explicit disabled bindings in the textInput scope to swallow them too.

Actually, simpler: make the editing scope `modal: true` since edit mode really does want to own the keyboard completely (including Esc to cancel editing vs global Esc).

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the existing useInput block with a browse-mode scope**

Delete the current `useInput((input, key) => { ... })` block at lines 183-213.

Add (browse mode, always mounted):

```tsx
useKeyboardShortcuts([
  {
    keys: 'up',
    enabled: editingIndex === null,
    handler: () => setCursor((c) => Math.max(0, c - 1)),
  },
  {
    keys: 'down',
    enabled: editingIndex === null,
    handler: () => setCursor((c) => Math.min(FIELDS.length - 1, c + 1)),
  },
  {
    keys: 'enter',
    hint: 'edit',
    enabled: editingIndex === null,
    handler: () => {
      const field = FIELDS[cursor]!;
      if (field.type === 'boolean') {
        const current = field.get(draft);
        const toggled = current === 'true' ? 'false' : 'true';
        setDraft(field.set(draft, toggled));
      } else if (field.type === 'enum' && (field.options?.length ?? 0) <= 1) {
        // no-op
      } else {
        startEditing(cursor);
      }
    },
  },
  {
    keys: ['s', 'S'],
    hint: 'save',
    enabled: editingIndex === null,
    handler: () => {
      onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  },
  {
    keys: 'escape',
    enabled: editingIndex === null && hasChanges,
    handler: () => setDraft(config),
  },
]);
```

- [ ] **Step 3: Add a modal editing scope**

Inside the FieldEditor component (or inline when `editingIndex !== null` is rendered), add:

```tsx
function EditingScope({ onCancel }: { onCancel: () => void }) {
  useKeyboardShortcuts(
    [{ keys: 'escape', hint: 'cancel', handler: onCancel }],
    { modal: true }
  );
  return null;
}
```

Render `<EditingScope onCancel={stopEditing} />` inside the Options component when `editingIndex !== null`. This ensures Esc cancels editing AND blocks global navigation during editing.

Note: @inkjs/ui `TextInput` and `Select` continue to own their own input via internal `useInput` calls. A modal scope at the Ink level coexists with those components — modal means "keyboard-registry bindings below are shadowed," it does not block @inkjs/ui's own event handling. Test this explicitly in the smoke test.

- [ ] **Step 4: Remove the `onEditingChange` callback prop wiring**

In `src/tui/screens/options.tsx`, remove any remaining call to `props.onEditingChange` (the prop can stay for now to avoid breaking App's call site; Task 14 will remove the prop entirely).

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/tui/options.spec.tsx`
Expected: passes.

- [ ] **Step 6: Smoke test**

Run: `npm run su`, navigate to Options.
Verify:

- Up/Down moves cursor.
- Enter enters edit mode; @inkjs/ui TextInput/Select work normally.
- Esc cancels edit and returns to browse mode.
- `s` saves.
- Global D/R/S/O navigation works in browse mode.
- Global D/R/S/O navigation is **blocked** during editing (modal scope).

- [ ] **Step 7: Commit**

```bash
git add src/tui/screens/options.tsx
git commit -m "feat: migrate Options to useKeyboardShortcuts with modal edit scope"
```

---

### Task 11: Migrate Runner screen

**Files:**

- Modify: `src/tui/screens/runner.tsx`

Reference: `src/tui/screens/runner.tsx:49-172`.

The Runner has two view modes (primary, split) and many gated actions. Use two scopes:

1. **Always-on scope** — bindings shared across both modes (`v` to toggle view).
2. **Mode-specific scope** — swapped based on `viewMode`.

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the useInput block**

Delete the `useInput((input, key) => { ... })` block at lines 49-172.

Add:

```tsx
// Always-on scope
useKeyboardShortcuts([
  {
    keys: 'v',
    hint: viewMode === 'primary' ? 'split' : 'primary',
    enabled: tests.length > 0,
    handler: () => {
      setViewMode((prev) => {
        const next = prev === 'primary' ? 'split' : 'primary';
        onViewModeChange?.(next);
        return next;
      });
    },
  },
]);

// Primary-mode scope
useKeyboardShortcuts(
  viewMode === 'primary'
    ? [
        {
          keys: 'space',
          hint: 'select',
          enabled: status === 'complete',
          handler: () => toggleCurrentTestSelection(),
        },
        {
          keys: 'enter',
          hint: 're-run',
          enabled: status === 'complete' && selectedTests.size > 0,
          handler: () => onRerunTests?.(Array.from(selectedTests)),
        },
        { keys: 'up', handler: () => scrollUp() },
        { keys: 'down', handler: () => scrollDown() },
        { keys: 'f', hint: 'follow', handler: () => enableFollow() },
        {
          keys: 't',
          hint: 'transcript',
          handler: () => toggleTranscriptView(),
        },
        {
          keys: 'left',
          hintKey: '←→',
          hint: 'sessions',
          handler: () => switchToPreviousSession(),
        },
        { keys: 'right', handler: () => switchToNextSession() },
      ]
    : []
);

// Split-mode scope
useKeyboardShortcuts(
  viewMode === 'split'
    ? [
        { keys: 'm', hint: 'maximize', handler: () => toggleMaximize() },
        ...Array.from({ length: 9 }, (_, i) => ({
          keys: String(i + 1),
          handler: () => focusPane(i),
        })),
      ]
    : []
);
```

The `left` and `right` keys have different actions (prev vs next session) but share a single `[←→]sessions` hint in BottomBar — only the `left` binding declares the hint; `right` has none.

- [ ] **Step 3: Extract helper functions**

Extract `scrollUp`, `scrollDown`, `enableFollow`, `toggleTranscriptView`, `toggleCurrentTestSelection`, `switchToPreviousSession`, `switchToNextSession`, `toggleMaximize`, `focusPane` as local `const` helpers inside the Runner component. Each helper contains the corresponding body from the deleted `useInput` block:

- `scrollUp` / `scrollDown`: increase/decrease scroll offset by 3, set `following = false`.
- `enableFollow`: set offset to 0, `following = true`.
- `toggleTranscriptView`: toggle between `'execution'` and `'grading'` transcript view, add to `manualToggled` Set.
- `toggleCurrentTestSelection`: toggle the active test in `selectedTests` Set.
- `switchToPreviousSession` / `switchToNextSession`: find current test index in `tests`, move active test ID to `tests[idx-1]` or `tests[idx+1]`.
- `toggleMaximize`: toggle maximized state for focused pane.
- `focusPane(i)`: set focused pane to `tests[i]?.id`.

These all existed inline in the previous `useInput` block at `src/tui/screens/runner.tsx:49-172`; this step lifts them out verbatim.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/tui/runner.spec.tsx`
Expected: passes.

- [ ] **Step 5: Smoke test**

Run: `npm run su`, start a test run.
Verify all Runner keybindings behave as before in both primary and split modes, for both running and complete states.

- [ ] **Step 6: Commit**

```bash
git add src/tui/screens/runner.tsx
git commit -m "feat: migrate Runner to useKeyboardShortcuts with mode-specific scopes"
```

---

### Task 12: Migrate ConfirmDialog to a modal scope

**Files:**

- Modify: `src/tui/components/confirm-dialog.tsx`

Reference: `src/tui/components/confirm-dialog.tsx:15-21`.

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the useInput block**

Delete the `useInput(...)` block.

Add:

```tsx
useKeyboardShortcuts(
  [
    { keys: ['y', 'Y'], hint: 'yes', handler: onConfirm },
    { keys: ['n', 'N', 'escape'], hint: 'no', handler: onDismiss },
  ],
  { modal: true }
);
```

- [ ] **Step 3: Run the dialog spec**

Run: `npm test -- tests/tui/confirm-dialog.spec.tsx`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/tui/components/confirm-dialog.tsx
git commit -m "feat: migrate ConfirmDialog to modal useKeyboardShortcuts scope"
```

---

### Task 13: Migrate CleanupDialog to a modal scope

**Files:**

- Modify: `src/tui/components/cleanup-dialog.tsx`

Reference: `src/tui/components/cleanup-dialog.tsx:29-39`.

- [ ] **Step 1: Add the import**

```typescript
import { useKeyboardShortcuts } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace the useInput block**

Delete the `useInput(...)` block.

Add:

```tsx
useKeyboardShortcuts(
  [
    { keys: 'up', handler: () => setCursor((c) => Math.max(0, c - 1)) },
    {
      keys: 'down',
      handler: () => setCursor((c) => Math.min(OPTIONS.length - 1, c + 1)),
    },
    {
      keys: 'enter',
      hint: 'confirm',
      handler: () => onConfirm(OPTIONS[cursor]!.keepCount),
    },
    { keys: 'escape', hint: 'cancel', handler: onDismiss },
  ],
  { modal: true }
);
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tui/components/cleanup-dialog.tsx
git commit -m "feat: migrate CleanupDialog to modal useKeyboardShortcuts scope"
```

---

### Task 14: Migrate BottomBar to registry hints + cleanup

**Files:**

- Modify: `src/tui/components/bottom-bar.tsx`
- Modify: `src/tui/app.tsx` (remove `isEditingField`, `runnerViewMode`, guard flags that are now obsolete)
- Modify: `src/tui/screens/options.tsx` (remove `onEditingChange` prop)
- Modify: `src/tui/screens/runner.tsx` (remove `onViewModeChange` prop)
- Modify: `src/tui/screens/*.tsx` (remove `onContextHintsChange` prop from all screens)

- [ ] **Step 1: Add the import to BottomBar**

```typescript
import { useKeyboardHints } from '../keyboard/index.js';
```

- [ ] **Step 2: Replace BottomBar's rendering with registry-driven hints**

Inside the existing `BottomBar` component, keep:

- The free-form narrative slot (active screen name, "Run in progress..." indicator, etc.)

Replace the hardcoded hint strings with:

```tsx
const hints = useKeyboardHints();
// ...
<Text>{hints.map((h) => `[${h.displayKey}]${h.label}`).join(' ')}</Text>;
```

Preserve any existing styling (colors, spacing, active-screen highlight for the global nav keys).

For the global nav highlight (e.g., bold-white for the active screen's letter), compare against `screen` prop and apply conditional styling per hint.

- [ ] **Step 3: Remove the `onContextHintsChange` plumbing**

In each screen, delete calls to `props.onContextHintsChange(...)`. Delete the prop from each screen's Props type. Delete the state in App that tracks per-screen hints. Delete the `contextHints` prop passed into `<BottomBar>`.

- [ ] **Step 4: Remove the `onEditingChange` coupling**

Delete `isEditingField` state and `setIsEditingField` calls in App. Delete the `onEditingChange` prop from Options. Delete the corresponding useState line in App.

Verify: in Task 6, the App's `enabled` predicates referenced `isEditingField`. Since editing is now a modal scope in Options (Task 10), App's global nav is already shadowed during editing via the registry, so the `isEditingField` check is redundant. Remove `isModalOrEditing` references that relied on it; modal scopes handle it.

Actually, simpler: replace `!isModalOrEditing` in App's enabled predicates with `!showCancelDialog && !showCleanupDialog` (only the explicit dialog flags remain, since those still flip App state). Or remove all of them — if ConfirmDialog and CleanupDialog are now modal scopes (Tasks 12 and 13), they shadow App's bindings automatically. The `showCancelDialog`/`showCleanupDialog` guards in App's `enabled` predicates become redundant. Remove them.

The final App useKeyboardShortcuts becomes:

```tsx
useKeyboardShortcuts([
  {
    keys: ['d', 'D'],
    handler: () => setScreen('dashboard'),
    enabled: !isRunnerActive,
  },
  {
    keys: ['r', 'R'],
    handler: () => setScreen('runs'),
    enabled: !isRunnerActive,
  },
  {
    keys: ['s', 'S'],
    handler: () => setScreen('stats'),
    enabled: !isRunnerActive,
  },
  {
    keys: ['o', 'O'],
    handler: () => setScreen('options'),
    enabled: !isRunnerActive,
  },
  { keys: 'tab', handler: () => cycleScreen(1), enabled: !isRunnerActive },
  {
    keys: 'shift+tab',
    handler: () => cycleScreen(-1),
    enabled: !isRunnerActive,
  },
  { keys: ['q', 'Q'], handler: exit, enabled: !isRunnerActive },
  { keys: 'ctrl+c', handler: exit },
  {
    keys: 'escape',
    handler: () => setShowCancelDialog(true),
    enabled: isRunnerActive,
  },
  {
    keys: 'escape',
    handler: () => setScreen(previousScreen),
    enabled: screen === 'runner' && !isRunnerActive,
  },
  {
    keys: ['backspace', 'delete'],
    handler: () => setScreen(previousScreen),
    enabled: screen === 'runner' && !isRunnerActive,
  },
]);
```

- [ ] **Step 5: Remove the `onViewModeChange` prop**

Delete `runnerViewMode` state in App. Delete the `onViewModeChange` prop from Runner. Runner's hint for `v` already reflects the current view mode since bindings re-register on each render.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 8: Full smoke test**

Run: `npm run su`
Verify every keybinding on every screen still works:

- Dashboard: arrows, space, a, A, enter (run), esc, backspace, typed letters into search.
- Runs: arrows, delete, c, enter.
- Stats: s.
- Options: arrows, enter, s, esc (both edit-cancel and browse-discard-changes); global D/R/S/O blocked during editing.
- Runner (primary): space, enter, arrows, f, t, v, left/right.
- Runner (split): 1-9, m, v.
- Cancel dialog: y/Y, n/N, escape.
- Cleanup dialog: up/down, enter, escape.
- Global: D/R/S/O/tab/shift+tab/Q/ctrl+C.
- BottomBar hints reflect the active screen's bindings (no hardcoded strings).
- **Bug fix verification:** while typing in Dashboard's search, pressing lowercase `r`/`s`/`o` does NOT navigate.

- [ ] **Step 9: Commit**

```bash
git add src/tui/components/bottom-bar.tsx src/tui/app.tsx src/tui/screens/
git commit -m "feat: migrate BottomBar to registry hints and remove legacy coupling"
```

---

### Task 15: Audit for stray useInput calls

**Files:**

- Read: `src/tui/`

- [ ] **Step 1: Search for remaining useInput calls in src/tui/**

Use the Grep tool with pattern `useInput\(` in `src/tui/`. Expected: only `src/tui/keyboard/provider.tsx` contains `useInput`. Any other match is leftover from migration and needs follow-up.

- [ ] **Step 2: Address any remaining matches**

If any screen or component still uses `useInput` outside `src/tui/keyboard/provider.tsx`:

- If it's genuinely needed for a non-keyboard concern (unlikely), leave it.
- If it's leftover migration work, convert it using the same pattern as previous tasks.

- [ ] **Step 3: Update architecture docs**

Open `docs/architecture/tui-design.md`. The "Keyboard Navigation" section describes the current dispatch model. Add a paragraph at the top of that section:

```markdown
Keyboard input dispatches through `KeyboardRegistryProvider` (`src/tui/keyboard/`). Each screen and dialog declares its bindings via `useKeyboardShortcuts(bindings, options)`. BottomBar hints are derived automatically from the active registry via `useKeyboardHints()`. See `docs/specs/2026-04-19-keyboard-shortcut-abstraction-design.md` for the registry design.
```

The existing table of keybindings remains valid — the bindings themselves are unchanged; only the plumbing has been rewritten.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/tui-design.md
git commit -m "docs: update tui-design to reference keyboard registry"
```

---

## Verification Summary

After all tasks complete:

- [ ] Run `npm test` — all unit and component tests pass.
- [ ] Run `npm run typecheck` — clean.
- [ ] Run `npm run lint` — clean.
- [ ] Run `npm run build` — clean.
- [ ] Grep `src/tui/` for `useInput(` — only `src/tui/keyboard/provider.tsx` matches.
- [ ] Grep `src/tui/components/bottom-bar.tsx` for hardcoded nav key strings (`[D]ashboard`, `[R]uns`, etc.) — none remain.
- [ ] Smoke test the full TUI, confirming every keybinding listed in `docs/architecture/tui-design.md` works as documented.
- [ ] Confirm the typed-letter-navigates bug is fixed: lowercase `r`/`s`/`o` while typing in Dashboard search do not navigate.

import type { Key } from 'ink';
import { matchKey, isPrintable } from './match-key.js';
import type { Hint, Scope } from './types.js';

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
    const modalIdx = this.findLastModal();
    // React effect order fires child effects before parent effects, so inner
    // components register first in `scopes`. Iterate in natural (forward)
    // order so the innermost component is topmost. Modal scopes bypass this
    // ordering entirely and own dispatch while mounted.
    const candidates = modalIdx >= 0 ? [this.scopes[modalIdx]!] : this.scopes;

    for (let i = 0; i < candidates.length; i++) {
      const scope = candidates[i]!;
      for (const binding of scope.bindings) {
        if (!matchKey(binding.keys, input, key)) continue;
        if (binding.enabled === false) continue;
        binding.handler();
        return;
      }

      // textInput absorbs unmatched printable characters at the topmost
      // scope only. Lower textInput scopes are shadowed by whatever sits
      // above them; printables fall past.
      if (i === 0 && scope.textInput && isPrintable(input, key)) {
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

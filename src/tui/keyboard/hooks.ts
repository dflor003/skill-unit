import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
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

  // useLayoutEffect, not useEffect: dispatch reads the per-binding `enabled`
  // flag from the registry, so a stale scope causes the next keystroke to skip
  // a binding that should now be live. Layout effects run synchronously at
  // commit, before the next stdin chunk can arrive.
  useLayoutEffect(() => {
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

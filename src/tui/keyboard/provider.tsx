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

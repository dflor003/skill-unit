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

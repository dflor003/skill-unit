# Keyboard Shortcut Abstraction

## Problem

Keyboard handling in the Ink TUI is spread across eight `useInput` call sites (`app.tsx`, five screens, and two dialogs). Six concrete pains motivate the rewrite:

1. **Hint drift.** `bottom-bar.tsx` hardcodes hint strings that are maintained separately from the actual handlers. Adding or removing a binding requires remembering to update BottomBar too, and nothing enforces it.
2. **Duplicated mechanics.** Cursor navigation (↑/↓ with clamp), selection toggles on Space, enum cycling, and "Enter confirms" logic are reimplemented in four or five places each.
3. **Modal focus by flag.** `app.tsx` guards its handler with `showCancelDialog || showCleanupDialog || isEditingField`. Adding a new dialog means remembering to add a new flag in two places, and the "this modal captures input" semantics are implicit.
4. **Cross-component coupling.** Options reports its editing state to App via `onEditingChange` so App can disable navigation. Runner reports its view mode to App via `onViewModeChange` so BottomBar can swap hints. Both exist only because the registry of "what input is valid right now" lives in App.
5. **Stale-closure inconsistency.** Dashboard mirrors state into refs to avoid stale `useInput` closures. Options does not. The pattern works today but is a latent footgun.
6. **Typed-character-navigates bug.** While typing in Dashboard's search box, pressing `r` navigates to Runs because the global nav handler also sees the character. The current workaround is `Shift+R`/`Shift+S`/`Shift+O`, which is undiscoverable.

Every useful addition to TUI keyboard behavior currently requires editing multiple files in lockstep. The abstraction exists to collapse that into one declaration site per component.

## Design

### Core primitive

A hook that each component calls to declare its bindings. No JSX component surface (hooks are idiomatic for Ink, and a wrapper can be added later if needed).

```tsx
useKeyboardShortcuts(
  bindings: Binding[],
  options?: ScopeOptions
): void;

type Binding = {
  keys: string | string[];   // 'space', 'enter', 'up', 'a', 'ctrl+c', ['left', 'right']
  handler: () => void;
  hint?: string;             // label in BottomBar; omit to hide
  hintKey?: string;          // display override, e.g. '←→' for paired arrows
  enabled?: boolean;         // default true; false = fall through
};

type ScopeOptions = {
  modal?: boolean;       // shadow everything below this scope
  textInput?: boolean;   // swallow unmatched printable characters
  onText?: (ch: string) => void; // receive swallowed characters (textInput scopes only)
};
```

Modes are mutually exclusive. A scope picks one of normal, `modal`, or `textInput`.

### Key DSL

- **Special keys, lowercase:** `up`, `down`, `left`, `right`, `enter`, `escape`, `space`, `tab`, `backspace`, `delete`, `pageup`, `pagedown`.
- **Letters, case-sensitive:** `'a'` and `'A'` are distinct bindings. Matches existing Dashboard usage where `a` selects visible tests and `A` selects the spec group.
- **Numbers:** `'1'` through `'9'` for Runner's split-pane focus.
- **Modifiers:** `ctrl+c`, `shift+tab`. Combined with `+`.
- **Array of keys = OR:** `['y', 'Y']` fires the same handler. `['left', 'right']` is valid but typically paired with `hintKey: '←→'`.

### Architecture

- `<KeyboardRegistryProvider>` wraps the Ink app inside `app.tsx`. It owns:
  - A mutable list of registered scopes (append order = registration order).
  - A **single** root `useInput` call that dispatches events to the registry. No other component in the tree should call `useInput` directly after migration is complete, with the exception of third-party components like `@inkjs/ui`'s `TextInput` and `Select`.
- `useKeyboardShortcuts(bindings, options)` registers a scope on mount, updates its bindings on every render (bindings held behind a ref to avoid stale closures), and unregisters on unmount.
- `useKeyboardHints()` is a selector for BottomBar. It returns the currently visible hints as an ordered list of `{ displayKey, label }` pairs, filtered to only enabled bindings not shadowed by a modal scope.

### Dispatch rules

On each keypress:

1. If any `modal` scope is mounted, only the topmost modal scope participates in dispatch. Skip to step 3 with that scope as the only candidate.
2. Otherwise, iterate scopes top-down (most recently registered first).
3. For each candidate scope, iterate its bindings in declaration order and try to match the input:
   - **Match with `enabled !== false`** → fire handler, stop all dispatch.
   - **Match with `enabled === false`** → continue to the next binding in the same scope. If no other binding in this scope matches, continue to the next scope.
   - **No match** → continue to the next binding, then the next scope.
4. After all scopes are exhausted, if the topmost non-modal scope is `textInput: true` and the input is a printable character (non-empty `input` in Ink, no modifier) that went unmatched:
   - If the scope declared `onText`, call `onText(char)` and stop.
   - If not, still stop (the scope is absorbing text regardless).
5. Special keys (arrows, Enter, Tab, Esc, Backspace, Delete) and modified keys (Ctrl+X, Shift+Tab) always continue falling through past `textInput` scopes when unmatched. They are only swallowed by `modal` scopes.
6. Multiple bindings for the same key within a single scope are **allowed and intentional** — this is how mutually-exclusive conditions express themselves (see the App example below, which declares two `escape` bindings with mutually exclusive `enabled` predicates). The registry does not warn on duplicate keys. The first binding in declaration order whose `enabled !== false` and keys match is the one that fires.

### Mode semantics reference

| Mode        | Bindings fire | Unmatched printable  | Unmatched special keys |
| ----------- | ------------- | -------------------- | ---------------------- |
| normal      | yes           | fall through         | fall through           |
| `textInput` | yes           | swallowed → `onText` | fall through           |
| `modal`     | yes           | swallowed            | swallowed              |

### Hint rendering

BottomBar calls `useKeyboardHints()`. The selector walks the active (non-shadowed) scopes bottom-up, collects bindings with `hint` defined and `enabled !== false`, and returns them in registration order.

Display key resolution:

- If `hintKey` is provided, use it verbatim.
- Otherwise use `keys` if it's a string, or `keys[0]` if it's an array.
- Render as `[<displayKey>]<label>` with the current visual styling of BottomBar.

BottomBar retains its free-form narrative slots (run status indicator, active screen name, "Run in progress..." message). The invariant is not "everything in BottomBar comes from the registry" but rather "every key-labeled hint in BottomBar corresponds to a real active binding."

### How this fixes each pain point

- **Drift** — hints are derived from bindings; impossible to ship a hint without a handler, or vice versa.
- **Duplication** — shared mechanics (cursor nav, selection toggle) can be extracted into small helper hooks once the registry exists. The abstraction enables this; it does not mandate it. Extraction happens opportunistically as screens are migrated.
- **Modal focus** — `modal: true` replaces the three guard flags in `app.tsx`. Dialogs declare their scope and stop worrying about what's underneath them.
- **Cross-component coupling** — `onEditingChange` and `onViewModeChange` go away. Options owns its editing scope; Runner owns its view-mode scopes. Each component's hints surface automatically via `useKeyboardHints()`.
- **Typed-character-navigates bug** — `textInput: true` on Dashboard's scope swallows printable characters, so App's `r`/`s`/`o` globals no longer fire during typing. The `Shift+R` / `Shift+S` / `Shift+O` workarounds are removed; global nav returns to lowercase.
- **Stale closures** — the hook mirrors bindings into a ref on every render; individual screens no longer need to manage refs manually for keyboard state.
- **Context-sensitive Esc/Enter** — still context-sensitive, but now each context declares its binding locally with a hint that says what the key does _here_.

## Example usages

### App shell (global navigation)

```tsx
useKeyboardShortcuts([
  { keys: ['d', 'D'], handler: () => setScreen('dashboard') },
  { keys: ['r', 'R'], handler: () => setScreen('runs') },
  { keys: ['s', 'S'], handler: () => setScreen('stats') },
  { keys: ['o', 'O'], handler: () => setScreen('options') },
  { keys: 'tab', handler: () => cycleScreen(1) },
  { keys: 'shift+tab', handler: () => cycleScreen(-1) },
  { keys: ['q', 'ctrl+c'], handler: exit },
  {
    keys: 'escape',
    handler: goBackFromRunner,
    enabled: screen === 'runner' && runState.status !== 'running',
  },
  {
    keys: 'escape',
    handler: openCancelDialog,
    enabled: screen === 'runner' && runState.status === 'running',
  },
]);
```

### Dashboard (text-input scope)

```tsx
const searching = query.length > 0;

useKeyboardShortcuts(
  [
    { keys: 'up', handler: moveCursorUp },
    { keys: 'down', handler: moveCursorDown },
    {
      keys: 'enter',
      hint: 'run',
      handler: runSelected,
      enabled: selection.size > 0,
    },
    { keys: 'backspace', handler: deleteChar, enabled: searching },
    { keys: 'escape', handler: clearQuery, enabled: searching },
    { keys: 'space', hint: 'select', handler: toggle, enabled: !searching },
    { keys: 'a', hint: 'select all', handler: selectAll, enabled: !searching },
    {
      keys: 'A',
      hint: 'select group',
      handler: selectGroup,
      enabled: !searching,
    },
  ],
  {
    textInput: true,
    onText: (ch) => setQuery((q) => q + ch),
  }
);
```

### Dialog (modal scope)

```tsx
useKeyboardShortcuts(
  [
    { keys: ['y', 'Y'], hint: 'confirm', handler: onConfirm },
    { keys: ['n', 'N', 'escape'], hint: 'dismiss', handler: onDismiss },
  ],
  { modal: true }
);
```

## Migration plan

Each step leaves the TUI fully working. No big-bang rewrite.

1. **Build the core.** Provider, hook, selector, registry. Unit tests covering shadow rules, `textInput` semantics, `enabled` fall-through, duplicate-key warning, and dispatch ordering.
2. **Convert App.** Global navigation and Esc/Tab/Q move into `useKeyboardShortcuts`. Existing `useInput` block in `app.tsx` is deleted. Hints from this scope appear in BottomBar automatically once step 3 lands; until then, BottomBar's hardcoded strings continue to work.
3. **Convert BottomBar.** Read hints from `useKeyboardHints()`. Keep the free-form slots (run status, screen name). Remove hardcoded hint strings.
4. **Convert Dashboard.** First `textInput: true` scope. Validates the typed-character bug fix. Revert the Shift+R / Shift+S / Shift+O workarounds here — App's global nav returns to lowercase.
5. **Convert Runs, Stats.** Straightforward single-scope screens.
6. **Convert Options.** Editing mode becomes a nested `textInput: true` scope that mounts only when a field is being edited. Remove the `onEditingChange` callback to App.
7. **Convert Runner.** Two sub-scopes: an always-mounted scope for view-mode toggles and navigation, and a mode-specific scope that switches between primary-mode and split-mode bindings. Remove the `onViewModeChange` callback to App.
8. **Convert dialogs.** `ConfirmDialog` and `CleanupDialog` declare `modal: true` scopes. Remove the `showCancelDialog` and `showCleanupDialog` guard flags from App.
9. **Cleanup.** Delete any orphaned props, callbacks, and state in App that step 6 and 7 rendered obsolete. Audit `src/tui/` for any lingering `useInput` calls (should be zero except inside `<KeyboardRegistryProvider>` itself and third-party `@inkjs/ui` components).

## Testing strategy

The registry is a pure data structure plus a dispatch function, which makes it cheap to unit-test in isolation. Tests at the registry level cover:

- Scope registration and unregistration.
- Dispatch with one normal scope, multiple stacked scopes, and modal shadowing.
- `textInput` swallowing printable characters while letting specials through.
- `enabled: false` falling through to the next scope.
- `onText` receiving only unmatched printable characters, never specials.
- Multiple bindings for the same key within a scope resolving by first-enabled-match.
- Hint selector output matches expected visible bindings in the presence of modals, disabled bindings, and bindings without hints.

Integration tests at the Ink component level cover one representative scenario per scope mode: a normal-mode screen (Stats), a `textInput` screen (Dashboard with the bug-fix scenario), and a `modal` dialog (ConfirmDialog). These use ink-testing-library to render the provider + component tree and dispatch synthetic key events.

## Prior art

No off-the-shelf Ink-compatible solution exists. Checked before designing:

- **Ink built-ins** (`useInput`, `useFocus`, `useFocusManager`): provide raw keystroke callbacks and Tab-based focus cycling, but no binding registry, scope stacking, hint metadata, or modal/textInput modes. `isActive` on `useInput` is the only conflict-avoidance mechanism, and it does not compose.
- **React DOM hotkey libraries** (`react-hotkeys-hook`, `react-hotkeys`, `hotkeys-js`, `mousetrap`): all disqualified because they attach listeners to `document` / `window`. Node has neither; Ink routes input through stdin via its reconciler. None of them would work even if the API shape were otherwise suitable.
- **Ink-specific packages** on npm (`ink-hotkey`, `ink-keyboard`, `ink-shortcuts`, `ink-use-input`, `ink-keybindings`): none exist as of 2026-04.

The `useHotkeys(keys, handler, options)` signature from `react-hotkeys-hook` is the idiomatic shape to mirror for familiarity, but the implementation is entirely our own.

## Out of scope

The following are deliberately not part of this design:

- **Binding-to-JSX-slot mapping.** BottomBar renders hints as a flat list. If we later want to group hints by section ("Navigation | Actions | View"), that is an additive change to the hint model.
- **User-customizable keybindings.** The registry is fed by component code; there is no config file that rebinds keys. Could be added later by having the provider accept a remap table.
- **Key sequence / chord support.** Every binding is a single key (with optional modifier). `g g` -style vim chords would need a separate mechanism.
- **Help overlay.** A `?`-to-show-all-bindings panel is easy to add on top of the registry later but is not required by the six pain points.
- **Global hotkey persistence across screen transitions.** Bindings live exactly as long as the declaring component is mounted. Screen transitions unmount the previous screen's bindings; that is intentional.

## Risks

- **`@inkjs/ui` components run their own `useInput`.** The `TextInput` and `Select` components in `options.tsx` call `useInput` internally. Our registry cannot intercept those calls. The migration plan handles this by wrapping the edit-mode field editor in a `textInput: true` scope so App-level navigation is swallowed; the @inkjs/ui component itself continues to handle its own character input. This is not a regression from current behavior.
- **Hint ordering under migration.** During step 2, App's bindings register hints but BottomBar still renders hardcoded strings. Until step 3 lands, BottomBar may briefly show both sources. Mitigation: step 3 should follow step 2 in the same development session so the dual-source state is short-lived.
- **Ref-based binding updates.** The hook stores bindings in a ref that updates on every render. If a component re-renders extremely frequently (e.g., during heavy transcript streaming in Runner), the registry still dispatches against the latest bindings. No perf concern at current scale, but worth watching if Runner's render load increases.

---
paths: '**/*.tsx'
---

# Ink TUI Layout Rules

## Prevent layout thrashing with flexShrink

Fixed-height elements (headers, toolbars, status bars, borders, toggle bars) must set `flexShrink={0}`. Without it, Yoga will shrink chrome elements when content changes, causing the layout to jump.

Only the main content area should use `flexGrow={1}` to absorb available space. Everything else in a column layout should be pinned.

```tsx
// Correct: chrome is pinned, content fills remaining space
<Box flexDirection="column" flexGrow={1}>
  <Header flexShrink={0} /> {/* never shrinks */}
  <Toolbar flexShrink={0} /> {/* never shrinks */}
  <Box flexGrow={1}>
    {' '}
    {/* fills remaining space */}
    <Content />
  </Box>
  <StatusBar flexShrink={0} /> {/* never shrinks */}
</Box>
```

For fixed-width sidebars in row layouts, combine `width={N}` with `flexShrink={0}`:

```tsx
<Box flexDirection="row" flexGrow={1}>
  <Box width={38} flexShrink={0}>
    {' '}
    {/* sidebar never changes width */}
    <Sidebar />
  </Box>
  <Box flexGrow={1}>
    {' '}
    {/* main panel fills remaining space */}
    <Content />
  </Box>
</Box>
```

## Clip overflow instead of relying on truncation alone

Add `overflow="hidden"` to containers with constrained width or height. This catches edge cases where Unicode characters (which can be 2 cells wide) or unexpected content exceeds the calculated bounds.

## Measure the content area, not the panel

When calculating visible lines for scrolling or virtual rendering, place the `ref` on the content container itself, not on the outer panel. Subtracting a magic number for header/border overhead is fragile and breaks when chrome elements change.

```tsx
// Wrong: measuring outer panel and guessing overhead
<Box ref={ref} flexDirection="column" flexGrow={1}>
  <Header />   {/* 1 line? 2 with border? changes break the math */}
  <Content visibleLines={panelHeight - 4} />
</Box>

// Correct: measuring the content area directly
<Box flexDirection="column" flexGrow={1}>
  <Header />
  <Box ref={contentRef} flexGrow={1}>
    <Content visibleLines={contentHeight} />
  </Box>
</Box>
```

## Sidebar text truncation

Account for Unicode icon widths (some are 2 cells) when calculating truncation limits. Build in at least 1 extra character of margin beyond the naive calculation.

## Bold doesn't render reliably — use `color="white"` for emphasis

ANSI bold (`<Text bold>`) is rendered as genuine bold weight only when the terminal's active font has a bold variant. In many common Windows setups (default Git Bash font, certain Windows Terminal profiles), bold is silently dropped or rendered as the same weight as normal text, so the emphasis is invisible.

Use `color="white"` (the bright-white foreground) for text that needs to visually stand out. The rest of the UI should use default terminal foreground or `color="gray"` for dimmed text. The contrast between `white` and the terminal's default dim white is reliable across every terminal and font combination.

```tsx
// Wrong: bold may be invisible depending on terminal/font
<Text bold>Active item</Text>

// Correct: bright white is reliably distinct from the default foreground
<Text bold color="white">
  Active item
</Text>
```

Keep `bold` on the Text too — it still renders as bold where supported, and `color="white"` is the guaranteed fallback. The canonical reference for this pattern is the active item in the bottom navigation (`[D]ashboard [R]uns ...`), which uses `bold color="white"` for the active screen and `color="gray"` for inactive ones.

## Never call `process.exit()` from inside an Ink component

Ink enables alternate screen buffer (`\x1b[?1049h`), hides the cursor, and turns on mouse tracking (`\x1b[?1000h`) when it mounts. On unmount it emits the matching "off" escapes to restore the terminal. Calling `process.exit()` bypasses the unmount hook, so those sequences never fire and the terminal is left in a dirty state: frozen alt-buffer output, hidden cursor, and middle-click intercepted as escape-encoded mouse events (which Windows Terminal in particular will route to shell history navigation).

Use `useApp().exit()` instead. It signals Ink to tear down cleanly.

```tsx
// Wrong: leaks terminal state, grows worse with repeated runs
useInput((input) => {
  if (input === 'Q') process.exit(0);
});

// Correct: Ink runs its cleanup, terminal returns to normal
const { exit } = useApp();
useInput((input) => {
  if (input === 'Q') exit();
});
```

If the terminal has already been left in a bad state by a previous crash, `reset` (or `printf '\e[?1049l\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?25h'`) manually emits all the "off" sequences and recovers it.

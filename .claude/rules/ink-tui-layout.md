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

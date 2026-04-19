import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Mock @inkjs/ui to avoid ESM linking issues in vmForks pool
vi.mock('@inkjs/ui', () => ({
  Select: () => null,
  TextInput: () => null,
}));

import { App } from '../../src/tui/app.js';

describe('App', () => {
  it('renders with bottom bar', () => {
    const { lastFrame } = render(<App />);
    const output = lastFrame()!;
    expect(output).toContain('Dashboard');
  });

  it('shows dashboard by default', () => {
    const { lastFrame } = render(<App />);
    const output = lastFrame()!;
    expect(output).toBeDefined();
  });

  describe('when the user types lowercase nav letters into the Dashboard search box', () => {
    it('should route them into the search query instead of switching screens', async () => {
      // Arrange -- Dashboard is the default screen and its textInput scope
      // should absorb printable characters. App binds lowercase 'r' to Runs,
      // so without the scope fix pressing 'r' while typing would navigate away.
      const { stdin, lastFrame } = render(<App />);

      // Wait for Dashboard's useKeyboardShortcuts effect to register the
      // textInput scope. Without this, early keystrokes reach App's bindings
      // directly because the Dashboard scope isn't in the registry yet.
      await vi.waitFor(() => {
        expect(lastFrame()!).toContain('Search tests');
      });
      await new Promise((resolve) => setImmediate(resolve));

      // Act -- type 'rso' while on Dashboard
      stdin.write('r');
      await new Promise((resolve) => setImmediate(resolve));
      stdin.write('s');
      await new Promise((resolve) => setImmediate(resolve));
      stdin.write('o');

      // Assert -- we're still on Dashboard, and the typed characters landed
      // in the search box. The search-box chrome (🔍 glyph) and the counter
      // row ("tests") are Dashboard-only; if we'd navigated away, neither
      // would appear together with the typed query.
      await vi.waitFor(() => {
        const frame = lastFrame()!;
        expect(frame).toContain('rso');
        expect(frame).toContain('🔍');
      });
    });
  });
});

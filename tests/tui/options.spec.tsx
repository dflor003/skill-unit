import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Mock @inkjs/ui to avoid ESM linking issues in vmForks pool
vi.mock('@inkjs/ui', () => ({
  Select: ({
    options,
  }: {
    options: Array<{ label: string; value: string }>;
    onChange: (v: string) => void;
    defaultValue?: string;
  }) => {
    const { Text } = require('ink');
    return React.createElement(
      Text,
      null,
      `[Select: ${options.map((o: { label: string }) => o.label).join(', ')}]`
    );
  },
  TextInput: ({
    defaultValue,
    placeholder,
  }: {
    defaultValue?: string;
    onSubmit?: (v: string) => void;
    placeholder?: string;
  }) => {
    const { Text } = require('ink');
    return React.createElement(
      Text,
      null,
      `[Input: ${defaultValue ?? placeholder ?? ''}]`
    );
  },
}));

import { Options } from '../../src/tui/screens/options.js';

const defaultConfig = {
  'test-dir': 'skill-tests',
  runner: { tool: 'claude', model: null, 'max-turns': 10, concurrency: 5 },
  output: {
    format: 'interactive' as const,
    'show-passing-details': false,
    'log-level': 'info' as const,
  },
  execution: { timeout: '120s' },
  defaults: { setup: 'setup.sh', teardown: 'teardown.sh' },
};

describe('Options', () => {
  it('should render config fields', () => {
    // Act
    const { lastFrame } = render(
      <Options config={defaultConfig} onSave={() => {}} />
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('claude');
    expect(output).toContain('max-turns');
    expect(output).toContain('concurrency');
    expect(output).toContain('timeout');
  });

  it('should emit context hints on mount', () => {
    // Arrange
    const hintsCallback = vi.fn();

    // Act
    render(
      <Options
        config={defaultConfig}
        onSave={() => {}}
        onContextHintsChange={hintsCallback}
      />
    );

    // Assert
    expect(hintsCallback).toHaveBeenCalled();
    const hints =
      hintsCallback.mock.calls[hintsCallback.mock.calls.length - 1][0];
    const keys = hints.map((h: { key: string }) => h.key);
    expect(keys).toContain('[Enter]');
    expect(keys).toContain('[s]');
  });

  it('should show section headers', () => {
    // Act
    const { lastFrame } = render(
      <Options config={defaultConfig} onSave={() => {}} />
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('Runner');
    expect(output).toContain('Output');
    expect(output).toContain('Execution');
    expect(output).toContain('Defaults');
  });

  it('should show (none) for null model', () => {
    // Act
    const { lastFrame } = render(
      <Options config={defaultConfig} onSave={() => {}} />
    );

    // Assert
    expect(lastFrame()!).toContain('(none)');
  });

  it('should show cursor on first field', () => {
    // Act
    const { lastFrame } = render(
      <Options config={defaultConfig} onSave={() => {}} />
    );

    // Assert -- first field should have the cursor indicator
    expect(lastFrame()!).toContain('> tool');
  });
});

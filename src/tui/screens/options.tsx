import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useKeyboardShortcuts } from '../keyboard/index.js';
import { Select, TextInput } from '@inkjs/ui';
import type { SkillUnitConfig, LogLevel } from '../../types/config.js';

interface OptionsProps {
  config: SkillUnitConfig;
  onSave: (config: SkillUnitConfig) => void;
}

type FieldType = 'enum' | 'boolean' | 'number' | 'string';

interface FieldDef {
  section: string;
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  get: (c: SkillUnitConfig) => string;
  set: (c: SkillUnitConfig, v: string) => SkillUnitConfig;
}

const FIELDS: FieldDef[] = [
  {
    section: 'Runner',
    key: 'tool',
    label: 'tool',
    type: 'enum',
    options: ['claude'],
    get: (c) => c.runner.tool,
    set: (c, v) => ({ ...c, runner: { ...c.runner, tool: v } }),
  },
  {
    section: 'Runner',
    key: 'model',
    label: 'model',
    type: 'string',
    get: (c) => c.runner.model ?? '',
    set: (c, v) => ({ ...c, runner: { ...c.runner, model: v || null } }),
  },
  {
    section: 'Runner',
    key: 'max-turns',
    label: 'max-turns',
    type: 'number',
    get: (c) => String(c.runner['max-turns']),
    set: (c, v) => ({
      ...c,
      runner: { ...c.runner, 'max-turns': parseInt(v, 10) || 10 },
    }),
  },
  {
    section: 'Runner',
    key: 'concurrency',
    label: 'concurrency',
    type: 'number',
    get: (c) => String(c.runner.concurrency),
    set: (c, v) => ({
      ...c,
      runner: { ...c.runner, concurrency: parseInt(v, 10) || 5 },
    }),
  },
  {
    section: 'Output',
    key: 'format',
    label: 'format',
    type: 'enum',
    options: ['interactive', 'json'],
    get: (c) => c.output.format,
    set: (c, v) => ({
      ...c,
      output: { ...c.output, format: v as 'interactive' | 'json' },
    }),
  },
  {
    section: 'Output',
    key: 'show-passing-details',
    label: 'show-passing-details',
    type: 'boolean',
    get: (c) => String(c.output['show-passing-details']),
    set: (c, v) => ({
      ...c,
      output: { ...c.output, 'show-passing-details': v === 'true' },
    }),
  },
  {
    section: 'Output',
    key: 'log-level',
    label: 'log-level',
    type: 'enum',
    options: ['debug', 'verbose', 'info', 'success', 'warn', 'error'],
    get: (c) => c.output['log-level'],
    set: (c, v) => ({
      ...c,
      output: { ...c.output, 'log-level': v as LogLevel },
    }),
  },
  {
    section: 'Execution',
    key: 'timeout',
    label: 'timeout',
    type: 'string',
    get: (c) => c.execution.timeout,
    set: (c, v) => ({ ...c, execution: { ...c.execution, timeout: v } }),
  },
  {
    section: 'Defaults',
    key: 'setup',
    label: 'setup',
    type: 'string',
    get: (c) => c.defaults.setup,
    set: (c, v) => ({ ...c, defaults: { ...c.defaults, setup: v } }),
  },
  {
    section: 'Defaults',
    key: 'teardown',
    label: 'teardown',
    type: 'string',
    get: (c) => c.defaults.teardown,
    set: (c, v) => ({ ...c, defaults: { ...c.defaults, teardown: v } }),
  },
];

export function Options({ config, onSave }: OptionsProps) {
  const [cursor, setCursor] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<SkillUnitConfig>(config);
  const [saved, setSaved] = useState(false);

  // Reset draft when the saved config changes (e.g., navigating away and back)
  useEffect(() => {
    setDraft(config);
  }, [config]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(config);

  function startEditing(index: number) {
    setEditingIndex(index);
  }

  function stopEditing() {
    setEditingIndex(null);
  }

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
          // Single-option enum: nothing to choose, skip the editor
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
      hint: 'discard',
      enabled: editingIndex === null && hasChanges,
      handler: () => setDraft(config),
    },
  ]);

  let currentSection = '';

  return (
    <Box flexDirection="column">
      {editingIndex !== null && <OptionsEditingScope onCancel={stopEditing} />}
      <Box marginBottom={1}>
        <Text bold>Options</Text>
        <Text color="gray"> -- .skill-unit.yml</Text>
      </Box>

      {FIELDS.map((field, idx) => {
        const sectionHeader = field.section !== currentSection;
        if (sectionHeader) currentSection = field.section;
        const isActive = idx === cursor;
        const isEditing = idx === editingIndex;
        const value = field.get(draft);

        return (
          <Box key={field.key} flexDirection="column">
            {sectionHeader && (
              <Box marginTop={idx === 0 ? 0 : 1}>
                <Text bold color="cyan">
                  {field.section}
                </Text>
              </Box>
            )}
            <Box>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}{' '}
              </Text>
              <Text color="gray">{field.label}: </Text>
              {isEditing ? (
                <FieldEditor
                  field={field}
                  value={value}
                  onSubmit={(newValue) => {
                    setDraft(field.set(draft, newValue));
                    stopEditing();
                  }}
                />
              ) : (
                <Text bold={isActive}>{value || '(none)'}</Text>
              )}
            </Box>
          </Box>
        );
      })}

      {saved && (
        <Box marginTop={1}>
          <Text color="green">Saved.</Text>
        </Box>
      )}
      {!saved && hasChanges && (
        <Box marginTop={1}>
          <Text color="yellow">(unsaved changes)</Text>
        </Box>
      )}
    </Box>
  );
}

function OptionsEditingScope({ onCancel }: { onCancel: () => void }) {
  useKeyboardShortcuts(
    [{ keys: 'escape', hint: 'cancel', handler: onCancel }],
    { modal: true }
  );
  return null;
}

function FieldEditor({
  field,
  value,
  onSubmit,
}: {
  field: FieldDef;
  value: string;
  onSubmit: (value: string) => void;
}) {
  if (field.type === 'enum' && field.options) {
    return (
      <Select
        options={field.options.map((o) => ({ label: o, value: o }))}
        defaultValue={value}
        onChange={onSubmit}
      />
    );
  }

  return (
    <TextInput
      defaultValue={value}
      onSubmit={onSubmit}
      placeholder={field.label}
    />
  );
}

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SkillUnitConfig } from '../../types/config.js';

interface OptionsProps {
  config: SkillUnitConfig;
  onSave: (config: SkillUnitConfig) => void;
}

interface Field {
  section: string;
  label: string;
  value: string;
}

function configToFields(config: SkillUnitConfig): Field[] {
  return [
    { section: 'Runner', label: 'tool', value: config.runner.tool },
    { section: 'Runner', label: 'model', value: config.runner.model ?? '(none)' },
    { section: 'Runner', label: 'max-turns', value: String(config.runner['max-turns']) },
    { section: 'Runner', label: 'concurrency', value: String(config.runner.concurrency) },
    { section: 'Output', label: 'format', value: config.output.format },
    { section: 'Output', label: 'show-passing-details', value: String(config.output['show-passing-details']) },
    { section: 'Output', label: 'log-level', value: config.output['log-level'] },
    { section: 'Execution', label: 'timeout', value: config.execution.timeout },
    { section: 'Defaults', label: 'setup', value: config.defaults.setup },
    { section: 'Defaults', label: 'teardown', value: config.defaults.teardown },
  ];
}

export function Options({ config, onSave }: OptionsProps) {
  const fields = configToFields(config);
  const [cursor, setCursor] = useState(0);
  const [saved, setSaved] = useState(false);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(fields.length - 1, c + 1));
    } else if (input === 's' || input === 'S') {
      onSave(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  });

  let currentSection = '';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Options</Text>
        <Text color="gray"> -- .skill-unit.yml</Text>
      </Box>

      {fields.map((field, idx) => {
        const sectionHeader = field.section !== currentSection;
        if (sectionHeader) currentSection = field.section;
        const isActive = idx === cursor;

        return (
          <Box key={`${field.section}-${field.label}`} flexDirection="column">
            {sectionHeader && (
              <Box marginTop={idx === 0 ? 0 : 1}>
                <Text bold color="cyan">{field.section}</Text>
              </Box>
            )}
            <Box>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}
                {' '}
                <Text color="gray">{field.label}:</Text>
                {' '}
                <Text bold={isActive}>{field.value}</Text>
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        {saved
          ? <Text color="green">Saved.</Text>
          : <Text color="gray">[s] save  [up/down] navigate</Text>
        }
      </Box>
    </Box>
  );
}

import fs from 'node:fs';
import YAML from 'yaml';
import type { SkillUnitConfig } from '../types/config.js';

// -- Default configuration ----------------------------------------------------

export const CONFIG_DEFAULTS: SkillUnitConfig = {
  'test-dir': 'skill-tests',
  runner: {
    tool: 'claude',
    model: null,
    'max-turns': 10,
    concurrency: 5,
  },
  output: {
    format: 'interactive',
    'show-passing-details': false,
    'log-level': 'info',
  },
  execution: {
    timeout: '120s',
  },
  defaults: {
    setup: 'setup.sh',
    teardown: 'teardown.sh',
  },
};

// -- YAML parsing and serialization -------------------------------------------

export function parseYaml(text: string): Record<string, unknown> {
  const result = YAML.parse(text);
  if (result === null || result === undefined || typeof result !== 'object') {
    return {};
  }
  return result as Record<string, unknown>;
}

export function serializeYaml(obj: Record<string, unknown>): string {
  return YAML.stringify(obj);
}

// -- Config loading -----------------------------------------------------------

export function loadConfig(configPath: string): SkillUnitConfig {
  const defaults = JSON.parse(
    JSON.stringify(CONFIG_DEFAULTS)
  ) as SkillUnitConfig;

  if (!configPath || !fs.existsSync(configPath)) {
    return defaults;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Partial<SkillUnitConfig> &
    Record<string, unknown>;

  const merged = deepMerge(defaults, parsed);

  // Backward compat: if the YAML used the old `runner-concurrency` key, copy it to `concurrency`
  const runnerRaw = parsed.runner as Record<string, unknown> | undefined;
  if (
    runnerRaw &&
    'runner-concurrency' in runnerRaw &&
    !('concurrency' in runnerRaw)
  ) {
    merged.runner.concurrency = runnerRaw['runner-concurrency'] as number;
  }

  return merged;
}

// Deep merge source into target. Arrays are replaced, objects are merged recursively.
function deepMerge(
  target: SkillUnitConfig,
  source: Record<string, unknown>
): SkillUnitConfig {
  const result = JSON.parse(JSON.stringify(target)) as SkillUnitConfig;
  const resultAsMap = result as unknown as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = resultAsMap[key];

    if (srcVal === null || srcVal === undefined) continue;

    if (
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      resultAsMap[key] = deepMerge(
        tgtVal as unknown as SkillUnitConfig,
        srcVal as Record<string, unknown>
      );
    } else {
      resultAsMap[key] = srcVal;
    }
  }

  return result;
}

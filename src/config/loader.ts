import fs from 'node:fs';
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

// -- Minimal YAML parser ------------------------------------------------------
// Handles the subset used in frontmatter and .skill-unit.yml:
//   - Scalar strings:  key: value
//   - Inline lists:    key: [a, b, c]
//   - Block lists:     key:\n  - item\n  - item
//   - One level of nesting: parent:\n  child: value
//   - Comments:        # ignored
//   - Booleans:        key: true / false
//   - Numbers:         key: 42
//   - Null:            key: null

export function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    // Top-level key (no leading whitespace)
    const topMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1];
    const rawValue = topMatch[2].trim();

    // Check if this is a parent key with nested children (value is empty and
    // next non-blank line is indented)
    if (!rawValue) {
      // Look ahead for indented lines (block list or nested object)
      const nested: Record<string, unknown> = {};
      let isList = false;
      const listItems: string[] = [];
      i++;

      while (i < lines.length) {
        const child = lines[i];
        if (!child.trim() || child.trim().startsWith('#')) {
          i++;
          continue;
        }
        // Must be indented (2+ spaces)
        if (!/^\s{2,}/.test(child)) break;

        const trimmed = child.trim();

        // Block list item
        if (trimmed.startsWith('- ')) {
          isList = true;
          listItems.push(trimmed.slice(2).trim());
          i++;
          continue;
        }

        // Nested key-value
        const childMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)/);
        if (childMatch) {
          const childKey = childMatch[1];
          const childRaw = childMatch[2].trim();
          // Check for block list under nested key
          if (!childRaw) {
            const childList: string[] = [];
            i++;
            while (i < lines.length) {
              const sub = lines[i];
              if (!sub.trim() || sub.trim().startsWith('#')) {
                i++;
                continue;
              }
              if (!/^\s{4,}/.test(sub)) break;
              const subTrimmed = sub.trim();
              if (subTrimmed.startsWith('- ')) {
                childList.push(subTrimmed.slice(2).trim());
                i++;
              } else {
                break;
              }
            }
            nested[childKey] = childList.length ? childList : null;
          } else {
            nested[childKey] = parseScalar(childRaw);
            i++;
          }
          continue;
        }

        i++;
      }

      result[key] = isList ? listItems : nested;
      continue;
    }

    // Inline value
    result[key] = parseValue(rawValue);
    i++;
  }

  return result;
}

// Parse a value that may be an inline array or a scalar
function parseValue(raw: string): unknown {
  // Strip inline comments (but not inside quoted strings)
  let value = raw;
  if (!value.startsWith('"') && !value.startsWith("'")) {
    const commentIdx = value.indexOf(' #');
    if (commentIdx > 0) value = value.slice(0, commentIdx).trim();
  }

  // Inline list: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => {
      const t = s.trim();
      // Strip quotes
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return t;
    });
  }

  return parseScalar(value);
}

// Parse a scalar value: boolean, null, number, quoted string, or plain string
function parseScalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  // Numbers
  if (/^\d+$/.test(value)) return parseInt(value, 10);

  // Strip quotes from scalar strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

// -- Config loading -----------------------------------------------------------

export function loadConfig(configPath: string): SkillUnitConfig {
  const defaults = JSON.parse(JSON.stringify(CONFIG_DEFAULTS)) as SkillUnitConfig;

  if (!configPath || !fs.existsSync(configPath)) {
    return defaults;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Partial<SkillUnitConfig> & Record<string, unknown>;

  const merged = deepMerge(defaults, parsed);

  // Backward compat: if the YAML used the old `runner-concurrency` key, copy it to `concurrency`
  const runnerRaw = parsed.runner as Record<string, unknown> | undefined;
  if (runnerRaw && 'runner-concurrency' in runnerRaw && !('concurrency' in runnerRaw)) {
    merged.runner.concurrency = runnerRaw['runner-concurrency'] as number;
  }

  return merged;
}

// Deep merge source into target. Arrays are replaced, objects are merged recursively.
function deepMerge(target: SkillUnitConfig, source: Record<string, unknown>): SkillUnitConfig {
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
        srcVal as Record<string, unknown>,
      );
    } else {
      resultAsMap[key] = srcVal;
    }
  }

  return result;
}

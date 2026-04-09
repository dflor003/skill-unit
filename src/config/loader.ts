import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { SkillUnitConfig } from '../types/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'default-config.yml');

// -- Default configuration ----------------------------------------------------

export const CONFIG_DEFAULTS: SkillUnitConfig = {
  'test-dir': 'skill-tests',
  runner: {
    tool: 'claude',
    model: null,
    'max-turns': 50,
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

// -- Config saving ------------------------------------------------------------

/**
 * Load the bundled default-config.yml template as a YAML Document,
 * preserving all comments and structure.
 */
function loadTemplate(): YAML.Document {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  return YAML.parseDocument(raw);
}

/**
 * Set a dotted path (e.g., "runner.model") in a YAML Document,
 * preserving surrounding comments.
 */
function setIn(doc: YAML.Document, keyPath: string[], value: unknown): void {
  if (keyPath.length === 1) {
    doc.set(keyPath[0], value);
    return;
  }
  // Navigate to the nested map node, then set the leaf
  let node = doc.get(keyPath[0], true) as YAML.YAMLMap | undefined;
  for (let i = 1; i < keyPath.length - 1; i++) {
    if (!node || !(node instanceof YAML.YAMLMap)) return;
    node = node.get(keyPath[i], true) as YAML.YAMLMap | undefined;
  }
  if (node && node instanceof YAML.YAMLMap) {
    node.set(keyPath[keyPath.length - 1], value);
  }
}

/**
 * Persist a SkillUnitConfig to disk.
 *
 * If the config file already exists, it is parsed as a Document so user
 * comments are preserved. Otherwise, the bundled template is used as the
 * starting point, giving new files the full commented structure.
 *
 * Only values that differ from CONFIG_DEFAULTS are written; fields that
 * match defaults keep their template/original values.
 */
export function saveConfig(configPath: string, config: SkillUnitConfig): void {
  const doc = fs.existsSync(configPath)
    ? YAML.parseDocument(fs.readFileSync(configPath, 'utf-8'))
    : loadTemplate();

  const d = CONFIG_DEFAULTS;

  // Top-level
  if (config['test-dir'] !== d['test-dir'])
    setIn(doc, ['test-dir'], config['test-dir']);

  // Runner
  if (config.runner.tool !== d.runner.tool)
    setIn(doc, ['runner', 'tool'], config.runner.tool);
  if (config.runner.model !== d.runner.model)
    setIn(doc, ['runner', 'model'], config.runner.model);
  if (config.runner['max-turns'] !== d.runner['max-turns'])
    setIn(doc, ['runner', 'max-turns'], config.runner['max-turns']);
  if (config.runner.concurrency !== d.runner.concurrency)
    setIn(doc, ['runner', 'runner-concurrency'], config.runner.concurrency);

  // Output
  if (config.output.format !== d.output.format)
    setIn(doc, ['output', 'format'], config.output.format);
  if (
    config.output['show-passing-details'] !== d.output['show-passing-details']
  )
    setIn(
      doc,
      ['output', 'show-passing-details'],
      config.output['show-passing-details']
    );
  if (config.output['log-level'] !== d.output['log-level'])
    setIn(doc, ['output', 'log-level'], config.output['log-level']);

  // Execution
  if (config.execution.timeout !== d.execution.timeout)
    setIn(doc, ['execution', 'timeout'], config.execution.timeout);

  // Defaults
  if (config.defaults.setup !== d.defaults.setup)
    setIn(doc, ['defaults', 'setup'], config.defaults.setup);
  if (config.defaults.teardown !== d.defaults.teardown)
    setIn(doc, ['defaults', 'teardown'], config.defaults.teardown);

  fs.writeFileSync(configPath, doc.toString(), 'utf-8');
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

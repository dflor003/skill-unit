import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand } from 'citty';
import { createLogger } from '../../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'config',
  'default-config.yml'
);

const BOOTSTRAP_PERMISSION = 'Bash(node */skill-unit/scripts/*)';
const CONFIG_FILENAME = '.skill-unit.yml';
const TEST_DIR = 'skill-tests';
const GITIGNORE_ENTRY = '.workspace';
const SETTINGS_PATH = path.join('.claude', 'settings.json');

interface StepResult {
  target: string;
  action: 'created' | 'updated' | 'skipped';
  detail?: string;
}

function ensureTestDir(root: string): StepResult {
  const dir = path.join(root, TEST_DIR);
  const gitkeep = path.join(dir, '.gitkeep');
  if (fs.existsSync(gitkeep)) {
    return { target: path.join(TEST_DIR, '.gitkeep'), action: 'skipped' };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(gitkeep, '', 'utf-8');
  return { target: path.join(TEST_DIR, '.gitkeep'), action: 'created' };
}

function ensureConfigFile(root: string): StepResult {
  const dest = path.join(root, CONFIG_FILENAME);
  if (fs.existsSync(dest)) {
    return { target: CONFIG_FILENAME, action: 'skipped' };
  }
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  fs.writeFileSync(dest, template, 'utf-8');
  return { target: CONFIG_FILENAME, action: 'created' };
}

function ensureGitignoreEntry(root: string): StepResult {
  const file = path.join(root, '.gitignore');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, GITIGNORE_ENTRY + '\n', 'utf-8');
    return { target: '.gitignore', action: 'created' };
  }
  const existing = fs.readFileSync(file, 'utf-8');
  const lines = existing.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(GITIGNORE_ENTRY)) {
    return { target: '.gitignore', action: 'skipped' };
  }
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  fs.writeFileSync(
    file,
    existing + (needsNewline ? '\n' : '') + GITIGNORE_ENTRY + '\n',
    'utf-8'
  );
  return { target: '.gitignore', action: 'updated' };
}

interface ClaudeSettings {
  permissions?: {
    allow?: unknown[];
    deny?: unknown[];
    ask?: unknown[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function ensureSettingsPermission(root: string): StepResult {
  const file = path.join(root, SETTINGS_PATH);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const initial: ClaudeSettings = {
      permissions: { allow: [BOOTSTRAP_PERMISSION] },
    };
    fs.writeFileSync(file, JSON.stringify(initial, null, 2) + '\n', 'utf-8');
    return { target: SETTINGS_PATH, action: 'created' };
  }

  const raw = fs.readFileSync(file, 'utf-8');
  let parsed: ClaudeSettings;
  try {
    parsed = raw.trim() === '' ? {} : (JSON.parse(raw) as ClaudeSettings);
  } catch (err) {
    throw new Error(
      `Failed to parse ${SETTINGS_PATH} as JSON: ${(err as Error).message}`,
      { cause: err }
    );
  }

  const permissions = (parsed.permissions ??= {});
  const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
  if (allow.includes(BOOTSTRAP_PERMISSION)) {
    return { target: SETTINGS_PATH, action: 'skipped' };
  }
  allow.push(BOOTSTRAP_PERMISSION);
  permissions.allow = allow;
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
  return { target: SETTINGS_PATH, action: 'updated' };
}

export interface InitResult {
  steps: StepResult[];
  changed: boolean;
}

export function runInit(root: string): InitResult {
  const steps: StepResult[] = [
    ensureTestDir(root),
    ensureConfigFile(root),
    ensureGitignoreEntry(root),
    ensureSettingsPermission(root),
  ];
  const changed = steps.some((s) => s.action !== 'skipped');
  return { steps, changed };
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Bootstrap a project for skill-unit (idempotent)',
  },
  args: {
    root: {
      type: 'string',
      description: 'Project root directory (defaults to cwd)',
    },
  },
  run({ args }) {
    const log = createLogger('init');
    const root = path.resolve(args.root ?? process.cwd());
    const { steps, changed } = runInit(root);

    for (const step of steps) {
      if (step.action === 'created') {
        log.success(`Created ${step.target}`);
      } else if (step.action === 'updated') {
        log.success(`Updated ${step.target}`);
      } else {
        log.info(`${step.target} already configured (skipped)`);
      }
    }

    if (changed) {
      console.log(
        'Project bootstrapped for skill-unit. Create your first test with `/test-design <skill-name>`.'
      );
    } else {
      console.log(
        'Project already bootstrapped for skill-unit. No changes made.'
      );
    }
  },
});

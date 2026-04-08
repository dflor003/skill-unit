#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// skill-unit compiler — parses spec files, loads config, generates manifests
//
// This module exports functions for programmatic use by cli.js and also
// works as a library for the skill-unit pipeline. It handles:
//
//   1. Loading .skill-unit.yml configuration
//   2. Discovering *.spec.md files
//   3. Parsing spec files (YAML frontmatter + markdown test cases)
//   4. Resolving tool permissions (3-level chain)
//   5. Resolving fixture and skill paths
//   6. Building manifest JSON objects
//
// Zero npm dependencies. All parsing is hand-rolled for the minimal YAML
// and markdown subsets used by the framework.
// ---------------------------------------------------------------------------

// -- Built-in defaults --------------------------------------------------------

const BUILT_IN_ALLOWED = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Agent',
  'Skill',
];
const BUILT_IN_DISALLOWED = ['AskUserQuestion'];

const CONFIG_DEFAULTS = {
  'test-dir': 'skill-tests',
  runner: {
    tool: 'claude',
    model: null,
    'max-turns': 10,
  },
  output: {
    format: 'interactive',
    'show-passing-details': false,
    'log-level': 'info',
  },
  execution: {
    timeout: '120s',
    'grader-concurrency': 5,
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

function parseYaml(text) {
  const result = {};
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
      const nested = {};
      let isList = false;
      const listItems = [];
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
        const childMatch = trimmed.match(
          /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)/
        );
        if (childMatch) {
          const childKey = childMatch[1];
          const childRaw = childMatch[2].trim();
          // Check for block list under nested key
          if (!childRaw) {
            const childList = [];
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
            nested[childKey] = parseYamlValue(childRaw);
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
    result[key] = parseYamlValue(rawValue);
    i++;
  }

  return result;
}

function parseYamlValue(raw) {
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
      if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
      ) {
        return t.slice(1, -1);
      }
      return t;
    });
  }

  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

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

function loadConfig(configPath) {
  const defaults = JSON.parse(JSON.stringify(CONFIG_DEFAULTS));

  if (!configPath || !fs.existsSync(configPath)) {
    return defaults;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);

  return mergeConfig(defaults, parsed);
}

function mergeConfig(defaults, parsed) {
  const result = JSON.parse(JSON.stringify(defaults));

  if (parsed['test-dir'] != null) result['test-dir'] = parsed['test-dir'];

  if (parsed.runner && typeof parsed.runner === 'object') {
    if (parsed.runner.tool != null) result.runner.tool = parsed.runner.tool;
    if (parsed.runner.model != null) result.runner.model = parsed.runner.model;
    if (parsed.runner['max-turns'] != null)
      result.runner['max-turns'] = parsed.runner['max-turns'];
    if (parsed.runner['allowed-tools'])
      result.runner['allowed-tools'] = parsed.runner['allowed-tools'];
    if (parsed.runner['disallowed-tools'])
      result.runner['disallowed-tools'] = parsed.runner['disallowed-tools'];
  }

  if (parsed.output && typeof parsed.output === 'object') {
    if (parsed.output.format != null)
      result.output.format = parsed.output.format;
    if (parsed.output['show-passing-details'] != null)
      result.output['show-passing-details'] =
        parsed.output['show-passing-details'];
    if (parsed.output['log-level'] != null)
      result.output['log-level'] = parsed.output['log-level'];
  }

  if (parsed.execution && typeof parsed.execution === 'object') {
    if (parsed.execution.timeout != null)
      result.execution.timeout = parsed.execution.timeout;
    if (parsed.execution['grader-concurrency'] != null)
      result.execution['grader-concurrency'] =
        parsed.execution['grader-concurrency'];
  }

  if (parsed.defaults && typeof parsed.defaults === 'object') {
    if (parsed.defaults.setup != null)
      result.defaults.setup = parsed.defaults.setup;
    if (parsed.defaults.teardown != null)
      result.defaults.teardown = parsed.defaults.teardown;
  }

  return result;
}

// -- Spec file parsing --------------------------------------------------------

function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: {}, body: content };

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx < 0) return { frontmatter: {}, body: content };

  const yamlBlock = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  const frontmatter = parseYaml(yamlBlock);

  return { frontmatter, body };
}

function parseTestCases(body) {
  const testCases = [];
  // Split on ### headings
  const sections = body.split(/^### /m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split('\n');
    const heading = lines[0].trim();

    // Parse ID and name from heading
    const colonIdx = heading.indexOf(':');
    if (colonIdx < 0) continue; // Not a valid test case heading

    const id = heading.slice(0, colonIdx).trim();
    const name = heading.slice(colonIdx + 1).trim();

    // State machine for parsing sections
    let state = null; // "fixtures" | "prompt" | "expectations" | "negative-expectations"
    const fixtures = [];
    const promptLines = [];
    const expectations = [];
    const negativeExpectations = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect section labels
      if (trimmed === '**Fixtures:**') {
        state = 'fixtures';
        continue;
      }
      if (trimmed === '**Prompt:**') {
        state = 'prompt';
        continue;
      }
      if (trimmed === '**Expectations:**') {
        state = 'expectations';
        continue;
      }
      if (trimmed === '**Negative Expectations:**') {
        state = 'negative-expectations';
        continue;
      }

      // Horizontal rules are cosmetic
      if (/^---\s*$/.test(trimmed)) continue;

      // Collect content based on current state
      if (state === 'fixtures') {
        if (trimmed.startsWith('- ')) {
          fixtures.push(trimmed.slice(2).trim());
        } else if (trimmed && !trimmed.startsWith('**')) {
          // Non-blank, non-label line: could be description text, skip
        } else if (trimmed.startsWith('**')) {
          // Hit next label, re-process this line
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'prompt') {
        if (trimmed.startsWith('> ')) {
          promptLines.push(trimmed.slice(2));
        } else if (trimmed === '>') {
          promptLines.push('');
        } else if (trimmed === '') {
          // Blank line after prompt ends the prompt section
          if (promptLines.length > 0) state = null;
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'expectations') {
        if (trimmed.startsWith('- ')) {
          expectations.push(trimmed.slice(2).trim());
        } else if (trimmed === '') {
          // Blank line, continue collecting
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'negative-expectations') {
        if (trimmed.startsWith('- ')) {
          negativeExpectations.push(trimmed.slice(2).trim());
        } else if (trimmed === '') {
          // Blank line, continue collecting
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }
    }

    const tc = { id, name, prompt: promptLines.join('\n') };
    if (fixtures.length) tc['fixture-paths'] = fixtures;
    if (expectations.length) tc.expectations = expectations;
    if (negativeExpectations.length)
      tc['negative-expectations'] = negativeExpectations;

    testCases.push(tc);
  }

  return testCases;
}

function parseSpecFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const testCases = parseTestCases(body);

  return {
    path: filePath,
    frontmatter,
    testCases,
  };
}

// -- Discovery ----------------------------------------------------------------

function discoverSpecsRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip fixture directories — they contain spec files used as test data
      if (entry.name === 'fixtures') continue;
      results.push(...discoverSpecsRecursive(fullPath));
    } else if (entry.name.endsWith('.spec.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

function discoverSpecs(testDir, filters) {
  const {
    paths: filterPaths,
    names: filterNames,
    tags: filterTags,
    tests: filterTests,
  } = filters || {};

  // If explicit paths provided, use those directly
  let specPaths;
  if (filterPaths && filterPaths.length > 0) {
    specPaths = filterPaths.map((p) => path.resolve(p));
  } else {
    specPaths = discoverSpecsRecursive(path.resolve(testDir));
  }

  // Sort by path for consistent ordering
  specPaths.sort();

  // Parse each spec for filtering
  const specs = [];
  for (const sp of specPaths) {
    if (!fs.existsSync(sp)) {
      process.stderr.write(`Warning: spec file not found: ${sp}\n`);
      continue;
    }

    const spec = parseSpecFile(sp);

    // Filter by name(s)
    if (filterNames && filterNames.length > 0) {
      if (!filterNames.includes(spec.frontmatter.name)) continue;
    }

    // Filter by tags
    if (filterTags && filterTags.length > 0) {
      const specTags = spec.frontmatter.tags || [];
      const hasMatch = filterTags.some((t) => specTags.includes(t));
      if (!hasMatch) continue;
    }

    // Filter test cases by ID
    if (filterTests && filterTests.length > 0) {
      spec.testCases = spec.testCases.filter((tc) =>
        filterTests.includes(tc.id)
      );
      if (spec.testCases.length === 0) {
        process.stderr.write(`Warning: no test cases match filter in ${sp}\n`);
        continue;
      }
    }

    specs.push(spec);
  }

  return specs;
}

// -- Tool permission resolution -----------------------------------------------

function resolveToolPermissions(config, specFrontmatter) {
  // Level 1: built-in defaults
  let allowed = [...BUILT_IN_ALLOWED];
  let disallowed = [...BUILT_IN_DISALLOWED];

  // Level 2: .skill-unit.yml overrides
  if (config.runner && config.runner['allowed-tools']) {
    allowed = [...config.runner['allowed-tools']];
  }
  if (config.runner && config.runner['disallowed-tools']) {
    disallowed = [...config.runner['disallowed-tools']];
  }

  // Level 3: spec frontmatter overrides
  const fm = specFrontmatter || {};

  if (fm['allowed-tools']) {
    // Full replace (ignore -extra)
    allowed = [...fm['allowed-tools']];
  } else if (fm['allowed-tools-extra']) {
    // Union
    for (const tool of fm['allowed-tools-extra']) {
      if (!allowed.includes(tool)) allowed.push(tool);
    }
  }

  if (fm['disallowed-tools']) {
    disallowed = [...fm['disallowed-tools']];
  } else if (fm['disallowed-tools-extra']) {
    for (const tool of fm['disallowed-tools-extra']) {
      if (!disallowed.includes(tool)) disallowed.push(tool);
    }
  }

  // Conflict resolution: disallow wins
  allowed = allowed.filter((t) => !disallowed.includes(t));

  return { allowed, disallowed };
}

// -- Path resolution ----------------------------------------------------------

function resolveFixturePath(fixturePath, specDir, repoRoot) {
  if (!fixturePath) return null;
  const absolute = path.resolve(specDir, fixturePath);
  return path.relative(repoRoot, absolute);
}

function resolveSkillPath(skillName, repoRoot) {
  if (!skillName) return null;

  // Check .claude/skills/{name}/SKILL.md first, then skills/{name}/SKILL.md
  const candidates = [
    path.join(repoRoot, '.claude', 'skills', skillName, 'SKILL.md'),
    path.join(repoRoot, 'skills', skillName, 'SKILL.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.relative(repoRoot, path.dirname(candidate));
    }
  }

  return null;
}

// -- Manifest generation ------------------------------------------------------

function buildManifest(spec, config, options) {
  const { timestamp, modelOverride, timeoutOverride, maxTurnsOverride } =
    options || {};
  const fm = spec.frontmatter;
  const specDir = path.dirname(spec.path);
  const repoRoot = process.cwd();

  // Resolve paths
  const globalFixturePath = fm['global-fixtures']
    ? resolveFixturePath(fm['global-fixtures'], specDir, repoRoot)
    : null;

  const skillPath = resolveSkillPath(fm.skill, repoRoot);

  // Resolve tool permissions
  const { allowed, disallowed } = resolveToolPermissions(config, fm);

  // Resolve per-test fixture paths
  const testCases = spec.testCases.map((tc) => {
    const entry = { id: tc.id, prompt: tc.prompt };
    if (tc['fixture-paths'] && tc['fixture-paths'].length) {
      entry['fixture-paths'] = tc['fixture-paths'].map((fp) =>
        resolveFixturePath(fp, specDir, repoRoot)
      );
    }
    return entry;
  });

  // Determine timeout: CLI override > spec frontmatter > config
  const timeout = timeoutOverride || fm.timeout || config.execution.timeout;

  // Determine model and max-turns with CLI overrides
  const model = modelOverride || config.runner.model;
  const maxTurns = maxTurnsOverride || config.runner['max-turns'];

  return {
    'spec-name': fm.name || path.basename(spec.path, '.spec.md'),
    'global-fixture-path': globalFixturePath,
    'skill-path': skillPath,
    timestamp: timestamp || formatTimestamp(new Date()),
    timeout: String(timeout),
    runner: {
      tool: config.runner.tool,
      model: model,
      'max-turns': maxTurns,
      'allowed-tools': allowed,
      'disallowed-tools': disallowed,
    },
    'test-cases': testCases,
  };
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

// -- Exports ------------------------------------------------------------------

module.exports = {
  loadConfig,
  discoverSpecs,
  parseSpecFile,
  parseFrontmatter,
  parseTestCases,
  parseYaml,
  resolveToolPermissions,
  resolveSkillPath,
  resolveFixturePath,
  buildManifest,
  formatTimestamp,
  CONFIG_DEFAULTS,
};

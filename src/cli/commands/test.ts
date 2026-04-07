import path from 'node:path';
import { defineCommand } from 'citty';
import { loadConfig } from '../../config/loader.js';
import { discoverSpecPaths, filterSpecs } from '../../core/discovery.js';
import { parseSpecFile, buildManifest, formatTimestamp } from '../../core/compiler.js';
import { createLogger } from '../../core/logger.js';
import type { SpecFilter } from '../../types/spec.js';

export const testCommand = defineCommand({
  meta: {
    name: 'test',
    description: 'Run tests from spec files (full test pipeline)',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file',
      default: '.skill-unit.yml',
    },
    all: {
      type: 'boolean',
      description: 'Run all tests (required when no other filters are provided)',
    },
    file: {
      type: 'string',
      alias: 'f',
      description: 'Filter by file path',
    },
    tag: {
      type: 'string',
      description: 'Filter by tag',
    },
    test: {
      type: 'string',
      description: 'Filter by test case IDs (comma-separated)',
    },
    name: {
      type: 'string',
      description: 'Filter by spec name',
    },
    model: {
      type: 'string',
      description: 'Override model for runner',
    },
    timeout: {
      type: 'string',
      description: 'Override timeout (e.g. 60s, 2m)',
    },
    'max-turns': {
      type: 'string',
      description: 'Override max turns for runner',
    },
    'keep-workspaces': {
      type: 'boolean',
      description: 'Keep temporary workspaces after test run',
    },
    ci: {
      type: 'boolean',
      description: 'Enable CI mode (non-interactive, exits non-zero on failure)',
    },
    'no-stream': {
      type: 'boolean',
      description: 'Disable streaming output',
    },
  },
  run({ args, rawArgs }) {
    const log = createLogger('test');
    const config = loadConfig(args.config ?? '.skill-unit.yml');

    // Build filter from args
    const filter: SpecFilter = {};
    if (args.name) filter.name = args.name.split(',').map((n: string) => n.trim());
    if (args.tag) filter.tag = args.tag.split(',').map((t: string) => t.trim());
    if (args.file) filter.file = args.file.split(',').map((f: string) => f.trim());
    if (args.test) filter.test = args.test.split(',').map((t: string) => t.trim());

    const hasFilter = args.all || args.name || args.tag || args.file || args.test;

    // Collect positional args as additional name filters
    const knownValues = [args.config, args.name, args.tag, args.file, args.test, args.model, args.timeout, args['max-turns']].filter(Boolean);
    const positional = rawArgs.filter((a) => !a.startsWith('-') && !knownValues.includes(a));
    if (positional.length > 0) {
      filter.name = [...(filter.name ?? []), ...positional];
    }

    const hasAnyFilter = hasFilter || positional.length > 0;

    if (!hasAnyFilter) {
      log.error('No filter specified. Use --all to run all tests, or specify --name, --tag, --file, or --test.');
      process.stderr.write('Use --all to run all tests or provide a filter.\n');
      process.exit(1);
    }

    const specPaths = discoverSpecPaths(config['test-dir']);
    const specs = specPaths.map((p) => parseSpecFile(p));
    const filtered = filterSpecs(specs, filter);

    if (filtered.length === 0) {
      log.warn('No spec files found matching filters');
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const modelOverride = args.model ?? null;
    const timeoutOverride = args.timeout ?? null;
    const maxTurnsOverride = args['max-turns'] ? parseInt(args['max-turns'], 10) : null;

    const manifests = filtered.map((spec) =>
      buildManifest(spec, config, { timestamp, modelOverride, timeoutOverride, maxTurnsOverride }),
    );

    log.info(`Compiled ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`);
    for (const manifest of manifests) {
      log.verbose(`  ${manifest['spec-name']}: ${manifest['test-cases'].length} test case${manifest['test-cases'].length === 1 ? '' : 's'}`);
    }

    log.warn('Test execution pipeline integration pending');
    // TODO (Task 24): Wire runner, grader, and reporter here.
    // The manifests are ready; actual execution is not yet implemented.
    const runDir = path.join('.skill-unit', 'runs', timestamp);
    log.info(`Run directory would be: ${runDir}`);
  },
});

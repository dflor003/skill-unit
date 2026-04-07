import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { loadConfig } from '../../config/loader.js';
import { discoverSpecPaths, filterSpecs } from '../../core/discovery.js';
import { parseSpecFile, buildManifest, formatTimestamp } from '../../core/compiler.js';
import { createLogger } from '../../core/logger.js';
import type { SpecFilter } from '../../types/spec.js';

export const compileCommand = defineCommand({
  meta: {
    name: 'compile',
    description: 'Parse spec files and write manifest JSON files',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file',
      default: '.skill-unit.yml',
    },
    tag: {
      type: 'string',
      description: 'Filter by tag',
    },
    file: {
      type: 'string',
      alias: 'f',
      description: 'Filter by file path',
    },
    test: {
      type: 'string',
      description: 'Filter by test case IDs (comma-separated)',
    },
    timestamp: {
      type: 'string',
      description: 'Override timestamp for manifest (useful for testing)',
    },
    'out-dir': {
      type: 'string',
      description: 'Directory to write manifest files',
    },
  },
  run({ args, rawArgs }) {
    const log = createLogger('compile');
    const config = loadConfig(args.config ?? '.skill-unit.yml');
    const specPaths = discoverSpecPaths(config['test-dir']);

    if (specPaths.length === 0) {
      log.warn('No spec files found in ' + config['test-dir']);
      return;
    }

    const specs = specPaths.map((p) => parseSpecFile(p));

    // Collect positional args as name filters
    const knownFlags = [args.config, args.tag, args.file, args.test, args.timestamp, args['out-dir']].filter(Boolean);
    const names = rawArgs.filter((a) => !a.startsWith('-') && !knownFlags.includes(a));

    const filter: SpecFilter = {};
    if (names.length > 0) filter.name = names;
    if (args.tag) filter.tag = args.tag.split(',').map((t: string) => t.trim());
    if (args.file) filter.file = args.file.split(',').map((f: string) => f.trim());
    if (args.test) filter.test = args.test.split(',').map((t: string) => t.trim());

    const filtered = filterSpecs(specs, filter);

    if (filtered.length === 0) {
      log.warn('No spec files found matching filters');
      return;
    }

    const timestamp = args.timestamp ?? formatTimestamp(new Date());
    const outDir = args['out-dir'] ?? path.join('.skill-unit', 'runs', timestamp, 'manifests');

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    for (const spec of filtered) {
      const manifest = buildManifest(spec, config, { timestamp });
      const specName = spec.frontmatter.name || path.basename(spec.path, '.spec.md');
      const outPath = path.join(outDir, `${specName}.manifest.json`);
      fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8');
      log.info(`Compiled: ${outPath}`);
    }

    console.log(`Compiled ${filtered.length} manifest${filtered.length === 1 ? '' : 's'} to ${outDir}`);
  },
});

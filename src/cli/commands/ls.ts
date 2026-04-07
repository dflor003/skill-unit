import { defineCommand } from 'citty';
import { loadConfig } from '../../config/loader.js';
import { discoverSpecPaths, filterSpecs } from '../../core/discovery.js';
import { parseSpecFile } from '../../core/compiler.js';
import type { SpecFilter } from '../../types/spec.js';

export const lsCommand = defineCommand({
  meta: {
    name: 'ls',
    description: 'List discovered spec files and test cases',
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
  },
  run({ args, rawArgs }) {
    const config = loadConfig(args.config ?? '.skill-unit.yml');
    const specPaths = discoverSpecPaths(config['test-dir']);

    if (specPaths.length === 0) {
      console.log('No spec files found in ' + config['test-dir']);
      return;
    }

    const specs = specPaths.map((p) => parseSpecFile(p));

    // Collect positional args as name filters
    const names = rawArgs.filter((a) => !a.startsWith('-') && a !== args.config && a !== args.tag && a !== args.file && a !== args.test);

    const filter: SpecFilter = {};
    if (names.length > 0) filter.name = names;
    if (args.tag) filter.tag = args.tag.split(',').map((t: string) => t.trim());
    if (args.file) filter.file = args.file.split(',').map((f: string) => f.trim());
    if (args.test) filter.test = args.test.split(',').map((t: string) => t.trim());

    const filtered = filterSpecs(specs, filter);

    if (filtered.length === 0) {
      console.log('No spec files found matching filters');
      return;
    }

    for (const spec of filtered) {
      const name = spec.frontmatter.name || spec.path;
      const tags = spec.frontmatter.tags.length > 0 ? ` [${spec.frontmatter.tags.join(', ')}]` : '';
      console.log(`${name}${tags}`);
      for (const tc of spec.testCases) {
        console.log(`  ${tc.id}: ${tc.name}`);
      }
    }
  },
});

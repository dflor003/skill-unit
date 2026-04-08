#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const compiler = require('./compiler');
const grader = require('./grader');
const report = require('./report');
const logger = require('./logger');
const log = logger('cli');
const { formatMd } = logger;

// ---------------------------------------------------------------------------
// skill-unit CLI — top-level entry point for the skill-unit testing framework
//
// Usage: node cli.js <command> [options] [spec-paths...]
//
// Commands:
//   test      Compile manifests and execute tests
//   compile   Parse specs, resolve config, write manifests (no execution)
//   ls        List discovered specs and their test cases
//   report    Generate report from a completed run
//
// See docs/plans/2026-04-04-cli-subcommands.md for the full design.
// ---------------------------------------------------------------------------

const HELP = `
skill-unit — structured testing for AI agent skills

Usage: skill-unit <command> [options] [names...]

Commands:
  test      Compile manifests and execute tests
  compile   Parse specs, resolve config, write manifests (no execution)
  ls        List discovered specs and their test cases
  report    Generate report from a completed run

Arguments:
  names                 One or more spec suite names to match (positional)

Shared Options:
  --config <path>       Path to .skill-unit.yml (default: .skill-unit.yml in cwd)
  -f, --file <path>    Filter by spec file path (repeatable)
  --tag <tags>          Filter by tag (comma-separated)
  --test <ids>          Filter to specific test case IDs (comma-separated)

Test/Compile Options:
  --all                 Run all discovered specs (required if no filters given)
  --model <model>       Override runner model
  --timeout <duration>  Override timeout (e.g., 60s, 5m)
  --max-turns <n>       Override max conversation turns
  --timestamp <ts>      Use specific timestamp (default: generate now)
  --out-dir <path>      Manifest output directory
  --keep-workspaces     Keep test workspaces after execution (test only)

Report Options:
  --run-dir <path>      Path to a completed run directory
`.trim();

// -- Argument parsing ---------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const rest = command ? args.slice(1) : args;

  const opts = { names: [], specPaths: [] };
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i];
    if (arg === '--config' && rest[i + 1]) {
      opts.config = rest[++i];
    } else if (arg === '--tag' && rest[i + 1]) {
      opts.tags = rest[++i].split(',').map((s) => s.trim());
    } else if (arg === '--test' && rest[i + 1]) {
      opts.tests = rest[++i].split(',').map((s) => s.trim());
    } else if (arg === '-f' || arg === '--file') {
      if (rest[i + 1]) opts.specPaths.push(rest[++i]);
    } else if (arg === '--model' && rest[i + 1]) {
      opts.model = rest[++i];
    } else if (arg === '--timeout' && rest[i + 1]) {
      opts.timeout = rest[++i];
    } else if (arg === '--max-turns' && rest[i + 1]) {
      opts.maxTurns = parseInt(rest[++i], 10);
    } else if (arg === '--timestamp' && rest[i + 1]) {
      opts.timestamp = rest[++i];
    } else if (arg === '--out-dir' && rest[i + 1]) {
      opts.outDir = rest[++i];
    } else if (arg === '--run-dir' && rest[i + 1]) {
      opts.runDir = rest[++i];
    } else if (arg === '--keep-workspaces') {
      opts.keepWorkspaces = true;
    } else if (arg === '--all') {
      opts.all = true;
    } else if (!arg.startsWith('--')) {
      opts.names.push(arg);
    } else {
      log.warn(`Unknown option: ${arg}`);
    }
    i++;
  }

  return { command, opts };
}

// -- Shared helpers -----------------------------------------------------------

function loadAndDiscover(opts) {
  const configPath = opts.config || path.join(process.cwd(), '.skill-unit.yml');
  const config = compiler.loadConfig(configPath);

  // Apply log level from config (env var LOG_LEVEL still takes precedence)
  if (!process.env.LOG_LEVEL && config.output && config.output['log-level']) {
    logger.setLevel(config.output['log-level']);
  }

  const testDir = path.resolve(config['test-dir']);

  const filters = {
    paths: opts.specPaths.length ? opts.specPaths : null,
    names: opts.names.length ? opts.names : null,
    tags: opts.tags || null,
    tests: opts.tests || null,
  };

  const specs = compiler.discoverSpecs(testDir, filters);
  return { config, specs };
}

function buildManifests(specs, config, opts) {
  const timestamp = opts.timestamp || compiler.formatTimestamp(new Date());
  const manifests = [];

  for (const spec of specs) {
    const manifest = compiler.buildManifest(spec, config, {
      timestamp,
      modelOverride: opts.model || null,
      timeoutOverride: opts.timeout || null,
      maxTurnsOverride: opts.maxTurns || null,
    });
    manifests.push(manifest);
  }

  return { manifests, timestamp };
}

function writeManifests(manifests, timestamp, opts) {
  const outDir =
    opts.outDir || path.join('.workspace', 'runs', timestamp, 'manifests');
  fs.mkdirSync(outDir, { recursive: true });

  const paths = [];
  for (const manifest of manifests) {
    const filename = `${manifest['spec-name']}.manifest.json`;
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
    paths.push(filePath);
    log.verbose(`Wrote: ${filePath}`);
  }

  return paths;
}

// -- Commands -----------------------------------------------------------------

function cmdLs(opts) {
  const { specs } = loadAndDiscover(opts);

  if (specs.length === 0) {
    console.log('No spec files found.');
    return;
  }

  const total = specs.reduce((n, s) => n + s.testCases.length, 0);
  const lines = [`# ${specs.length} spec(s), ${total} test case(s)`, ''];

  for (const spec of specs) {
    const fm = spec.frontmatter;
    const relPath = path.relative(process.cwd(), spec.path);
    const name = fm.name || path.basename(spec.path, '.spec.md');

    lines.push(`## ${name}`);
    lines.push(`   \`${relPath}\``);

    if (fm.tags && fm.tags.length) {
      lines.push(`   *${fm.tags.join(', ')}*`);
    }

    lines.push('');
    for (const tc of spec.testCases) {
      lines.push(`   - **${tc.id}**: ${tc.name}`);
    }

    lines.push('');
  }

  process.stdout.write(formatMd(lines.join('\n')) + '\n');
}

function cmdCompile(opts) {
  const { config, specs } = loadAndDiscover(opts);

  if (specs.length === 0) {
    console.log('No spec files found.');
    return;
  }

  const { manifests, timestamp } = buildManifests(specs, config, opts);
  const manifestPaths = writeManifests(manifests, timestamp, opts);

  console.log(`Compiled ${manifestPaths.length} manifest(s).`);
  for (const mp of manifestPaths) {
    console.log(`  ${mp}`);
  }
}

async function cmdTest(opts) {
  const hasFilter =
    opts.all ||
    opts.specPaths.length ||
    opts.names.length ||
    opts.tags ||
    opts.tests;
  if (!hasFilter) {
    log.error(
      'Specify specs to run, or use --name, --tag, --test to filter, or --all to run everything.'
    );
    process.exit(1);
  }

  const { config, specs } = loadAndDiscover(opts);

  if (specs.length === 0) {
    console.log('No spec files found.');
    return;
  }

  const { manifests, timestamp } = buildManifests(specs, config, opts);
  const manifestPaths = writeManifests(manifests, timestamp, opts);

  // Ensure gitignore entry
  const cwd = process.cwd();
  const gitignorePath = path.join(cwd, '.gitignore');
  const pattern = '.workspace/';
  if (fs.existsSync(gitignorePath)) {
    const contents = fs.readFileSync(gitignorePath, 'utf-8');
    if (!contents.split('\n').some((line) => line.trim() === pattern)) {
      fs.appendFileSync(gitignorePath, `${pattern}\n`);
    }
  }

  // Execute runner for each manifest sequentially
  const runnerScript = path.join(__dirname, 'runner.js');

  for (const mp of manifestPaths) {
    log.info(`Running: ${mp}`);

    const runnerArgs = [runnerScript, mp];
    if (opts.keepWorkspaces) runnerArgs.push('--keep-workspaces');

    const exitCode = await spawnAsync('node', runnerArgs, { cwd });
    if (exitCode !== 0) {
      log.error(`Runner exited with code ${exitCode} for ${mp}`);
    }
  }

  // Grade results
  log.info('Grading results');
  await grader.gradeSpecs(specs, config, timestamp);

  // Generate report
  const runDir = path.join('.workspace', 'runs', timestamp);
  log.info('Generating report');
  const result = report.generateReport(runDir);

  if (result.error) {
    log.error(result.error);
  } else {
    process.stdout.write(formatMd(result.terminalSummary, process.stdout));
  }
}

function cmdReport(opts) {
  const runDir = opts.runDir;

  if (!runDir) {
    log.error('--run-dir is required for the report command.');
    process.exit(1);
  }

  const result = report.generateReport(runDir);

  if (result.error) {
    log.error(result.error);
    process.exit(1);
  }

  process.stdout.write(formatMd(result.terminalSummary, process.stdout));
}

// -- Helpers ------------------------------------------------------------------

function spawnAsync(cmd, args, options) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code || 0));
    child.on('error', (err) => {
      log.error(`Spawn error: ${err.message}`);
      resolve(1);
    });
  });
}

// -- Main dispatch ------------------------------------------------------------

async function main() {
  const { command, opts } = parseArgs(process.argv);

  switch (command) {
    case 'ls':
      cmdLs(opts);
      break;
    case 'compile':
      cmdCompile(opts);
      break;
    case 'test':
      await cmdTest(opts);
      break;
    case 'report':
      cmdReport(opts);
      break;
    default:
      console.log(HELP);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// runner.ts -- executes test prompts in isolated workspaces
//
// Ports the JS runner.js to TypeScript with an event-emitter interface
// so the TUI can subscribe to live updates.
//
// Directory structure:
//   .workspace/                        -- repo root, gitignored
//     runs/{timestamp}/                -- one folder per run
//       manifests/{spec}.manifest.json -- manifest + progress files
//       logs/{spec}.{id}.log.jsonl     -- raw CLI output
//       results/{spec}.{id}.transcript.md -- conversation transcript
//       responses/{spec}.responses.json-- raw responses
//     workspaces/{uuid}/               -- ephemeral, per test case
//       work/                          -- agent cwd, contains fixtures
//       plugin/                        -- skill-under-test (--plugin-dir)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { createLogger } from './logger.js';
import {
  formatToolCall,
  formatToolResult,
  formatTurnUsage,
  formatSessionInit,
  formatUsageSummary,
} from './transcript-formatter.js';
import type { Manifest, ManifestTestCase } from '../types/spec.js';
import type { RunProgress } from '../types/run.js';
import type { SkillUnitConfig } from '../types/config.js';

const log = createLogger('runner');
const { MdStream } = createLogger;

// -- Workspace path scoping for file tools ----------------------------------

const FILE_TOOLS = new Set(['Read', 'Edit', 'Glob', 'Grep']);

/**
 * Build a system prompt that constrains the agent to the given workspace path.
 */
export function buildSystemPrompt(workspacePath: string): string {
  return `You are working in the directory: ${workspacePath}
You MUST NOT read, write, or access any files outside this directory.
All file operations (Read, Write, Edit, Glob, Grep, Bash) must target only files within this directory.
Do not use parent directory traversal or absolute paths outside this directory.

Always use relative paths from within the working directory for all tool calls.

Always use the Write or Edit tools for writing files. DO NOT fall back to the Bash tool for file writes if a tool call is blocked. Instead, inform the user and wait for further instructions.`;
}

/**
 * Rewrite bare file tool names to include workspace path restrictions.
 * Tools with existing path patterns (e.g., "Read(/some/path/**)") pass through unchanged.
 * Bash is not scoped.
 */
export function scopeToolsToWorkspace(
  allowedTools: string[],
  workspacePath: string
): string[] {
  return allowedTools.map((tool) => {
    if (FILE_TOOLS.has(tool)) {
      return `${tool}(${workspacePath}/**)`;
    }
    return tool;
  });
}

/**
 * Parse a timeout string (e.g. "120s", "5m") into milliseconds.
 * Defaults to 5 minutes (300000ms) if invalid or missing.
 */
export function parseTimeout(str: string | undefined): number {
  if (!str) return 300000;
  const match = str.match(/^(\d+)(s|m)?$/);
  if (!match) return 300000;
  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';
  return unit === 'm' ? value * 60000 : value * 1000;
}

// -- CLI argument profiles per harness tool ---------------------------------

type ArgBuilder = (
  model: string | null,
  maxTurns: number,
  pluginDir: string | null,
  allowedTools: string[],
  disallowedTools: string[],
  workspacePath: string
) => string[];

export const TOOL_PROFILES: Record<string, ArgBuilder> = {
  claude: (
    model,
    maxTurns,
    pluginDir,
    allowedTools,
    disallowedTools,
    workspacePath
  ) => [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--max-turns',
    String(maxTurns),
    '--permission-mode',
    'dontAsk',
    '--no-chrome',
    '--no-session-persistence',
    '--setting-sources',
    'local',
    '--strict-mcp-config',
    '--system-prompt',
    buildSystemPrompt(workspacePath),
    ...(model ? ['--model', model] : []),
    ...(pluginDir ? ['--plugin-dir', pluginDir] : []),
    ...(allowedTools.length ? ['--allowedTools', ...allowedTools] : []),
    ...(disallowedTools.length
      ? ['--disallowedTools', ...disallowedTools]
      : []),
  ],
  // Future: add copilot, codex profiles here
};

// -- Helpers ----------------------------------------------------------------

/**
 * Recursively copy a directory from src to dest.
 */
export function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureGitignore(dir: string, pattern: string): void {
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const contents = fs.readFileSync(gitignorePath, 'utf-8');
    if (contents.split('\n').some((line) => line.trim() === pattern)) return;
  }
  fs.appendFileSync(gitignorePath, `${pattern}\n`);
}

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Install the skill under test as a plugin at the given path.
 * Creates:
 *   {pluginPath}/skills/{skill-name}/   -- the skill files
 *   {pluginPath}/.claude-plugin/plugin.json -- bare plugin manifest
 * Returns the plugin dir path to pass via --plugin-dir, or null if skill not found.
 */
export function installSkillPlugin(
  skillSrcPath: string,
  pluginPath: string
): string | null {
  if (!skillSrcPath || !fs.existsSync(skillSrcPath)) {
    log.warn(`Skill path not found: ${skillSrcPath}`);
    return null;
  }

  const skillName = path.basename(skillSrcPath);

  // Copy skill into the plugin directory
  const skillsDest = path.join(pluginPath, 'skills', skillName);
  copyDirSync(skillSrcPath, skillsDest);

  // Generate bare plugin manifest
  const pluginMetaDir = path.join(pluginPath, '.claude-plugin');
  fs.mkdirSync(pluginMetaDir, { recursive: true });
  const pluginJson = {
    name: 'my-plugins',
    description: 'Local plugin',
  };
  fs.writeFileSync(
    path.join(pluginMetaDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2),
    'utf-8'
  );

  return pluginPath;
}

// -- Event-emitter interface ------------------------------------------------

export interface RunHandle extends EventEmitter {
  on(event: 'output', listener: (chunk: string) => void): this;
  on(event: 'tool-use', listener: (name: string, input: unknown) => void): this;
  on(event: 'progress', listener: (progress: RunProgress) => void): this;
  on(
    event: 'complete',
    listener: (result: {
      exitCode: number;
      timedOut: boolean;
      durationMs: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
    }) => void
  ): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(): void;
}

interface RunOptions {
  cwd: string;
  input: string;
  timeout: number;
  logPath: string;
  mdLogPath: string;
  testId: string;
  prompt: string;
  handle: RunHandle;
  /** When true, suppresses all direct writes to stderr/stdout (TUI mode). */
  silent: boolean;
  /** Callback to capture the spawned child process reference for kill(). */
  setProcRef?: (proc: ChildProcess) => void;
}

// -- Stream-json event parsing ----------------------------------------------

interface StreamEvent {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  output?: string;
  is_error?: boolean;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  total_cost_usd?: number;
  model?: string;
  cwd?: string;
  skills?: string[];
}

/**
 * Run a CLI command and pipe events through the handle emitter.
 */
function runAsync(
  cmd: string,
  cliArgs: string[],
  options: RunOptions
): Promise<{
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const { handle } = options;
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const proc = spawn(cmd, cliArgs, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (options.setProcRef) options.setProcRef(proc);

    // Open log files
    const logStream = options.logPath
      ? fs.createWriteStream(options.logPath, { flags: 'w' })
      : null;
    const mdLogStream = options.mdLogPath
      ? fs.createWriteStream(options.mdLogPath, { flags: 'w' })
      : null;

    // Write markdown log header
    if (mdLogStream) {
      mdLogStream.write(`# Transcript: ${options.testId || 'unknown'}\n\n`);
      mdLogStream.write(`**Prompt:** ${options.prompt || 'n/a'}\n\n`);
      mdLogStream.write(`---\n\n`);
    }

    // Streaming markdown formatter for terminal output (disabled in TUI mode)
    const mdOut = options.silent ? null : new MdStream(process.stderr);

    // Emit the prompt as the first transcript entry
    handle.emit('output', `**Prompt:**\n> ${options.prompt || 'n/a'}\n\n---\n`);

    let turnNumber = 0;
    let buffer = '';

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      buffer += chunk;

      // Write raw data to log file
      if (logStream) logStream.write(chunk);

      // Process complete lines (stream-json sends one JSON object per line)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as StreamEvent;

          if (event.type === 'system' && event.subtype === 'init') {
            const initText = formatSessionInit(event);
            handle.emit('output', initText);
            if (mdLogStream) {
              mdLogStream.write(initText);
            }
          } else if (event.type === 'assistant' && event.message) {
            turnNumber++;
            const content = event.message.content || [];
            const usage = event.message.usage;
            const textParts = content
              .filter((c) => c.type === 'text')
              .map((c) => c.text ?? '')
              .join('');
            const toolUses = content.filter((c) => c.type === 'tool_use');

            if (textParts || toolUses.length) {
              const turnHeader = `## Turn ${turnNumber}\n${formatTurnUsage(usage)}`;
              handle.emit('output', turnHeader);
              if (mdLogStream) {
                mdLogStream.write(`## Turn ${turnNumber} -- Assistant\n\n`);
                mdLogStream.write(formatTurnUsage(usage));
              }
            }

            if (textParts) {
              handle.emit('output', textParts);
              if (mdOut) mdOut.write(textParts);
              if (mdLogStream) {
                mdLogStream.write(`${textParts}\n\n`);
              }
            }

            for (const tu of toolUses) {
              const toolName = tu.name ?? '';
              const toolInput = tu.input ?? {};
              const toolText = formatToolCall(
                toolName,
                toolInput as Record<string, unknown>
              );
              handle.emit('output', toolText);
              handle.emit('tool-use', toolName, toolInput);
              if (mdOut) {
                mdOut.end();
                mdOut.write(toolText);
                mdOut.end();
              }
              if (mdLogStream) {
                mdLogStream.write(toolText);
              }
            }
          } else if (event.type === 'tool_result') {
            const output = event.output || '';
            const isError = event.is_error === true;
            const preview = output.substring(0, 200);
            const resultText = formatToolResult(
              preview + (output.length > 200 ? '...' : ''),
              isError
            );
            handle.emit('output', resultText);
            if (mdOut) {
              mdOut.write(resultText);
              mdOut.end();
            }
            if (mdLogStream) {
              mdLogStream.write(formatToolResult(output, isError));
            }
          } else if (event.type === 'result') {
            if (event.total_cost_usd) costUsd = event.total_cost_usd;
            if (event.usage) {
              inputTokens =
                (event.usage.input_tokens ?? 0) +
                (event.usage.cache_read_input_tokens ?? 0) +
                (event.usage.cache_creation_input_tokens ?? 0);
              outputTokens = event.usage.output_tokens ?? 0;
            }
            const summaryText = `---\n**Result:** ${event.subtype || 'unknown'}\n${formatUsageSummary(event.usage, event.total_cost_usd)}`;
            handle.emit('output', summaryText);
            if (mdLogStream) {
              mdLogStream.write(`---\n\n`);
              mdLogStream.write(
                `**Result:** ${event.subtype || 'unknown'}\n\n`
              );
              mdLogStream.write(
                formatUsageSummary(event.usage, event.total_cost_usd)
              );
            }
          }
        } catch {
          // Not valid JSON -- log as-is (only in CLI mode)
          if (!options.silent) process.stderr.write(trimmed + '\n');
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      if (!options.silent) process.stderr.write(data);
    });

    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, options.timeout || 300000);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);

      // Flush streaming formatter and write any remaining buffer to log
      if (mdOut) mdOut.end();
      if (logStream && buffer) logStream.write(buffer);
      if (logStream) logStream.end();
      if (mdLogStream) mdLogStream.end();

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          JSON.parse(buffer.trim());
        } catch {
          // ignore
        }
      }

      // Ensure streamed agent output ends with a newline so the next
      // log line starts on its own line.
      if (!options.silent) process.stderr.write('\n');

      const durationMs = Date.now() - startTime;
      const exitCode = timedOut ? 124 : code || 0;

      resolve({
        exitCode,
        timedOut,
        durationMs,
        costUsd,
        inputTokens,
        outputTokens,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      if (logStream) logStream.end();
      if (mdLogStream) mdLogStream.end();
      reject(err);
    });
  });
}

// -- Public API -------------------------------------------------------------

export interface RunTestOptions {
  /** When true, suppresses all direct writes to stderr/stdout (TUI mode). */
  silent?: boolean;
}

/**
 * Run a single test case in an isolated workspace.
 * Returns a RunHandle (EventEmitter) that emits progress events.
 */
export function runTest(
  manifest: Manifest,
  testCase: ManifestTestCase,
  config: SkillUnitConfig,
  options?: RunTestOptions
): RunHandle {
  const handle = new EventEmitter() as RunHandle;
  const silent = options?.silent ?? false;
  let proc: ChildProcess | null = null;

  handle.kill = () => {
    if (proc) {
      proc.kill('SIGTERM');
    }
  };

  // Run asynchronously so callers can attach listeners before events fire
  setImmediate(() => {
    _runTestAsync(manifest, testCase, config, handle, silent, (p) => {
      proc = p;
    }).catch((err: Error) => {
      handle.emit('error', err);
    });
  });

  return handle;
}

async function _runTestAsync(
  manifest: Manifest,
  testCase: ManifestTestCase,
  config: SkillUnitConfig,
  handle: RunHandle,
  silent: boolean,
  setProcRef?: (proc: ChildProcess) => void
): Promise<void> {
  const cwd = process.cwd();

  // In silent/TUI mode, create a no-op logger to prevent stderr writes
  const runLog = silent
    ? {
        debug: () => {},
        verbose: () => {},
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
      }
    : log;

  const specName = manifest['spec-name'];
  const rawGlobalFixturePath = manifest['global-fixture-path'];
  const rawSkillPath = manifest['skill-path'];
  const timestamp = manifest.timestamp;
  const timeoutStr = manifest.timeout;
  const runner = manifest.runner;

  const globalFixturePath = rawGlobalFixturePath
    ? path.resolve(cwd, rawGlobalFixturePath)
    : null;
  const skillPath = rawSkillPath ? path.resolve(cwd, rawSkillPath) : null;

  const tool = runner.tool || 'claude';
  const model = runner.model || null;
  const maxTurns = runner['max-turns'] || 10;
  const allowedTools = runner['allowed-tools'] || [];
  const disallowedTools = runner['disallowed-tools'] || [];
  const timeoutMs = parseTimeout(timeoutStr);

  const buildArgs = TOOL_PROFILES[tool];
  if (!buildArgs) {
    throw new Error(
      `Unsupported runner tool: "${tool}". Supported: ${Object.keys(TOOL_PROFILES).join(', ')}`
    );
  }

  // All workspace artifacts live under .workspace/ at the repo root.
  const workspaceRoot = path.join(cwd, '.workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  ensureGitignore(cwd, '.workspace/');

  // Run-specific directories
  const runDir = path.join(workspaceRoot, 'runs', timestamp);
  const logsDir = path.join(runDir, 'logs');
  const resultsDir = path.join(runDir, 'results');
  const workspacesDir = path.join(workspaceRoot, 'workspaces');

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(workspacesDir, { recursive: true });

  const testId = testCase.id;
  const prompt = testCase.prompt;
  const workspaceId = uuid();
  const workspaceBase = path.join(workspacesDir, workspaceId);
  const workspacePath = path.join(workspaceBase, 'work');
  const pluginPath = path.join(workspaceBase, 'plugin');

  runLog.verbose(`[${testId}]: Creating workspace ${workspaceId}`);

  // Emit initial progress
  handle.emit('progress', {
    status: 'running',
    specName,
    total: 1,
    completed: 0,
    current: testId,
    results: [],
  } satisfies RunProgress);

  // Create work directory from fixtures (global first, then per-test layered on top)
  fs.mkdirSync(workspacePath, { recursive: true });

  if (globalFixturePath && fs.existsSync(globalFixturePath)) {
    copyDirSync(globalFixturePath, workspacePath);
    runLog.debug(`[${testId}]: Global fixture copied`);
  } else if (globalFixturePath) {
    runLog.warn(
      `[${testId}]: Global fixture path not found: ${globalFixturePath}`
    );
  }

  // Layer per-test fixtures on top of global
  const perTestFixtures = testCase['fixture-paths'] || [];
  for (const rawFixPath of perTestFixtures) {
    const resolved = path.resolve(cwd, rawFixPath);
    if (fs.existsSync(resolved)) {
      copyDirSync(resolved, workspacePath);
      runLog.debug(`[${testId}]: Per-test fixture layered: ${rawFixPath}`);
    } else {
      runLog.warn(`[${testId}]: Per-test fixture path not found: ${resolved}`);
    }
  }

  if (!globalFixturePath && perTestFixtures.length === 0) {
    runLog.debug(`[${testId}]: No fixtures, empty workspace`);
  }

  // Install skill under test as a plugin (sibling to work dir)
  const pluginDir = skillPath
    ? installSkillPlugin(skillPath, pluginPath)
    : null;

  // Scope file tools to this test case's workspace path
  const scopedAllowed = scopeToolsToWorkspace(allowedTools, workspacePath);
  const cmdArgs = buildArgs(
    model,
    maxTurns,
    pluginDir,
    scopedAllowed,
    disallowedTools,
    workspacePath
  );

  runLog.info(`[${testId}]: Executing prompt via ${tool}`);
  runLog.verbose(
    `[${testId}]: Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
  );

  // Log files
  const logPath = path.join(logsDir, `${specName}.${testId}.log.jsonl`);
  const mdLogPath = path.join(
    resultsDir,
    `${specName}.${testId}.transcript.md`
  );

  const keepWorkspaces = false; // controlled by config in the future

  let exitCode: number;
  let timedOut = false;
  let durationMs: number;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await runAsync(tool, cmdArgs, {
      cwd: workspacePath,
      input: prompt,
      timeout: timeoutMs,
      logPath,
      mdLogPath,
      testId,
      prompt,
      handle,
      silent,
      setProcRef,
    });

    exitCode = result.exitCode;
    timedOut = result.timedOut;
    durationMs = result.durationMs;
    costUsd = result.costUsd;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;

    if (timedOut) {
      runLog.error(`[${testId}]: Timed out after ${timeoutMs}ms`);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    runLog.error(`[${testId}]: ${error.message}`);
    exitCode = 1;
    durationMs = 0;
  }

  // Cleanup workspace unless keepWorkspaces is set
  if (!keepWorkspaces) {
    runLog.verbose(`[${testId}]: Cleaning up workspace`);
    rmSync(workspaceBase);
  }

  const status = exitCode === 0 ? 'OK' : `FAIL(${exitCode})`;
  if (exitCode === 0) {
    runLog.success(
      `[${testId}]: ${status} (${(durationMs / 1000).toFixed(1)}s)`
    );
  } else {
    runLog.error(`[${testId}]: ${status} (${(durationMs / 1000).toFixed(1)}s)`);
  }

  // Emit final progress
  handle.emit('progress', {
    status: 'complete',
    specName,
    total: 1,
    completed: 1,
    current: null,
    results: [
      { id: testId, status: exitCode === 0 ? 'running' : 'error', durationMs },
    ],
  } satisfies RunProgress);

  handle.emit('complete', {
    exitCode,
    timedOut,
    durationMs,
    costUsd,
    inputTokens,
    outputTokens,
  });
}

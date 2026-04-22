// ---------------------------------------------------------------------------
// grader.ts -- dispatches the grader agent to evaluate test transcripts
//
// Ports grader.js to TypeScript with an event-emitter interface so the TUI
// can subscribe to live grading progress.
//
// After the runner produces transcripts, the grader spawns one CLI process
// per test case, passing expectations and the transcript path. Each grader
// reads the transcript, evaluates against expectations, and writes a results
// file.
//
// Concurrency is controlled by config.runner.concurrency (shared pool).
// gradeSpecs() is the CLI batch path; gradeTest() is the TUI per-test path.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
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
import { renderResultsMarkdown, normalizeGraderJson } from './reporter.js';
import { workspacePathFor } from './runner.js';
import type { Spec } from '../types/spec.js';
import type { SkillUnitConfig } from '../types/config.js';

const log = createLogger('grader');

// -- Types ------------------------------------------------------------------

export interface GradeResult {
  testId: string;
  specName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GradeHandle extends EventEmitter {
  on(event: 'output', listener: (chunk: string) => void): this;
  on(event: 'complete', listener: (result: GradeResult) => void): this;
  kill(): void;
}

// -- Seed results file -------------------------------------------------------

// Graders drift field names even when we prescribe a schema in prose. The
// much stronger forcing function is to write the file first -- every field
// already in canonical form, every value the grader must supply set to
// `null`. The grader then Reads this file and its job becomes "edit the
// nulls", not "invent a JSON object". LLMs mirror input shape, so preserving
// the canonical field names becomes the path of least resistance.

interface SeedCheck {
  text: string;
  met: null;
  evidence: null;
}

interface SeedResults {
  testId: string;
  testName: string;
  prompt: string;
  passed: null;
  expectations: SeedCheck[];
  negativeExpectations: SeedCheck[];
}

export function buildSeedResultsJson(tc: {
  id: string;
  name: string;
  prompt: string;
  expectations: string[];
  'negative-expectations': string[];
}): SeedResults {
  return {
    testId: tc.id,
    testName: tc.name,
    prompt: tc.prompt,
    passed: null,
    expectations: (tc.expectations || []).map((text) => ({
      text,
      met: null,
      evidence: null,
    })),
    negativeExpectations: (tc['negative-expectations'] || []).map((text) => ({
      text,
      met: null,
      evidence: null,
    })),
  };
}

function writeSeedResultsFile(
  resultsDir: string,
  specName: string,
  tc: {
    id: string;
    name: string;
    prompt: string;
    expectations: string[];
    'negative-expectations': string[];
  }
): string {
  fs.mkdirSync(resultsDir, { recursive: true });
  const jsonPath = path.join(resultsDir, `${specName}.${tc.id}.results.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(buildSeedResultsJson(tc), null, 2),
    'utf-8'
  );
  return jsonPath;
}

// -- Grader prompt construction -----------------------------------------------

export function buildGraderPrompt(
  tc: {
    id: string;
    name: string;
    prompt: string;
    expectations: string[];
    'negative-expectations': string[];
  },
  specName: string,
  timestamp: string
): string {
  const resultsDir = path.join('.workspace', 'runs', timestamp, 'results');
  const transcriptPath = path.join(
    resultsDir,
    `${specName}.${tc.id}.transcript.md`
  );
  const seedPath = path.join(resultsDir, `${specName}.${tc.id}.results.json`);
  const workspacePath = workspacePathFor(timestamp, specName, tc.id);

  // Fill-in-the-blank contract: the framework has already pre-written the
  // seed JSON file with the canonical schema and every expectation's `text`
  // already populated. The grader's only job is to replace each `null` with
  // a decision. This is a dramatically tighter forcing function than "emit
  // JSON matching this schema" -- field names are physically present in the
  // file the grader just read, so mirroring them is the path of least
  // resistance. Previous attempts at describing the schema in prose led to
  // pervasive drift (`overallResult`, `description`, nested `grading`, etc.)
  // that the normalizer had to paper over.
  return `Grade this test case by filling in the pre-seeded results file.

**Step 1.** Read the transcript. This is your primary evidence for behavioral expectations -- every decision must trace to something in it:

\`${transcriptPath}\`

**Step 2.** Read the seed results file. Every field is already in place; every \`null\` is a decision you must make. The non-null fields (\`testId\`, \`testName\`, \`prompt\`, each expectation's \`text\`) are authoritative and MUST NOT change:

\`${seedPath}\`

**Step 3.** If any expectation references filesystem state (created/modified files, settings, directory structure), verify it directly against the test workspace. This is the post-test state left behind by the agent-under-test:

\`${workspacePath}\`

Use Read for specific files (e.g. \`${workspacePath}/.skill-unit.yml\`) and Glob for pattern checks. Filesystem evidence trumps transcript silence: if the agent created a file but did not narrate doing so, the expectation is still met. If the workspace directory does not exist, treat filesystem expectations as unmet and note that in \`evidence\`.

**Skip nested \`.workspace/\` inside the workspace** (e.g. \`${workspacePath}/.workspace/...\`). Those are run artifacts the test agent created, not state to verify. Do not Glob or Read inside them. If an empty Glob result is the correct answer for this test (no fixtures, nothing created), accept it and move on — do not escalate or retry with different patterns.

**Step 4.** For each \`null\` in the seed, decide the correct value based on the evidence:
- Each \`expectations[i].met\`: \`true\` if the behavior in \`text\` was observed, else \`false\`.
- Each \`expectations[i].evidence\`: a short string citing specific turn numbers from the transcript, or a file path in the workspace, or both.
- Each \`negativeExpectations[i].met\`: \`true\` if the prohibited behavior did NOT occur (the negative requirement was upheld), \`false\` if the transcript or workspace shows the prohibited behavior.
- Each \`negativeExpectations[i].evidence\`: a short string citing the transcript or workspace state.
- \`passed\`: \`true\` only if every \`met\` above is \`true\`; otherwise \`false\`.

**Step 5.** Use the Write tool to overwrite the seed file at the same path. Preserve the schema EXACTLY: do not rename any field, do not add new fields, do not remove fields. The only values that change are the \`null\`s.

Write as soon as every \`null\` is decidable. Do not pre-fetch additional files for corroboration. After writing, stop. Do not produce additional output.`;
}

// -- Agent path resolution ----------------------------------------------------

export function resolveAgentPath(): string | null {
  const candidate = path.join(process.cwd(), 'agents', 'grader.md');
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

// -- CLI tool profiles for grader invocation ----------------------------------

// The grader runs as an isolated session: haiku model, Read/Glob/Write only,
// no user-global skills or MCP servers. Without these flags, `--agent` alone
// does NOT enforce the agent file's `model` or `tools` frontmatter, so the
// grader inherits the parent session's Opus model and every installed skill,
// which causes the grader to wander (e.g. exhausting max-turns on Bash
// exploration) and to deviate from the exact output format the reporter
// parses. Glob is allowed so the grader can verify filesystem expectations
// against the post-test workspace (see buildGraderPrompt, Step 3). Bash is
// explicitly disallowed: `--allowedTools` whitelists for permission-free use
// but does NOT enforce exclusivity, and `--permission-mode dontAsk` lets every
// other tool through. Without an explicit deny the grader will fall back to
// `find`/`ls` whenever Glob comes up dry, burning the turn budget. max-turns
// is set high enough for the worst case (multiple filesystem expectations,
// each requiring a Read).
export const GRADER_PROFILES: Record<string, (agentPath: string) => string[]> =
  {
    claude: (agentPath) => [
      '--print',
      '--verbose',
      '--output-format',
      'stream-json',
      '--max-turns',
      '20',
      '--permission-mode',
      'dontAsk',
      '--no-chrome',
      '--no-session-persistence',
      '--setting-sources',
      'local',
      '--strict-mcp-config',
      '--model',
      'haiku',
      '--allowedTools',
      'Read',
      'Glob',
      'Write',
      '--disallowedTools',
      'Bash',
      '--agent',
      agentPath,
    ],
  };

// -- Stream-json event type (shared with runner.ts) ---------------------------

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

// -- Spawn a single grader process --------------------------------------------

interface SpawnGraderOptions {
  /** Callback for each formatted markdown chunk (TUI streaming). */
  onOutput?: (chunk: string) => void;
  /** Path to write grader transcript file. */
  mdLogPath?: string;
  /** Callback to capture process reference for kill(). */
  setProcRef?: (proc: ChildProcess) => void;
}

function spawnGrader(
  tool: string,
  cliArgs: string[],
  prompt: string,
  options?: SpawnGraderOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(tool, cliArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (options?.setProcRef) options.setProcRef(proc);

    const mdLogStream = options?.mdLogPath
      ? fs.createWriteStream(options.mdLogPath, { flags: 'w' })
      : null;

    let stdout = '';
    let stderr = '';
    let buffer = '';
    let turnNumber = 0;

    function emit(text: string): void {
      // Normalize every chunk to end with a blank-line separator. Model text
      // (assistant textParts) has no trailing newline, so when the next
      // chunk starts with a block element like "## Turn N" or "---" it
      // glues to the previous chunk's last line and loses its markdown
      // structure. Historical transcript loading reads the file whole so
      // the TUI's per-chunk \n join does not save it there.
      const normalized = text.replace(/\n*$/, '\n\n');
      if (options?.onOutput) options.onOutput(normalized);
      if (mdLogStream) mdLogStream.write(normalized);
    }

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as StreamEvent;

          // Drop non-init system events (hooks, startup noise)
          if (event.type === 'system' && event.subtype !== 'init') {
            continue;
          }

          if (event.type === 'system' && event.subtype === 'init') {
            emit(formatSessionInit(event));
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
              emit(`## Turn ${turnNumber}\n${formatTurnUsage(usage)}`);
            }

            if (textParts) {
              emit(textParts);
            }

            for (const tu of toolUses) {
              const toolName = tu.name ?? '';
              const toolInput = tu.input ?? {};
              emit(
                formatToolCall(toolName, toolInput as Record<string, unknown>)
              );
            }
          } else if (event.type === 'tool_result') {
            const output = event.output || '';
            const isError = event.is_error === true;
            const preview = output.substring(0, 200);
            emit(
              formatToolResult(
                preview + (output.length > 200 ? '...' : ''),
                isError
              )
            );
          } else if (event.type === 'result') {
            emit(
              `---\n**Result:** ${event.subtype || 'unknown'}\n${formatUsageSummary(event.usage, event.total_cost_usd)}`
            );
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on('close', (code: number | null) => {
      if (mdLogStream) mdLogStream.end();
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });

    proc.on('error', (err: Error) => {
      if (mdLogStream) mdLogStream.end();
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// -- Grade a single test case -------------------------------------------------

export function gradeTest(
  testCase: {
    id: string;
    name: string;
    prompt: string;
    expectations: string[];
    'negative-expectations': string[];
  },
  transcriptPath: string,
  config: SkillUnitConfig,
  specName: string,
  timestamp: string
): GradeHandle {
  const handle = new EventEmitter() as GradeHandle;
  let proc: ChildProcess | null = null;

  handle.kill = () => {
    if (proc) {
      proc.kill('SIGTERM');
    }
  };

  setImmediate(async () => {
    const tool = config.runner.tool || 'claude';
    const buildArgs = GRADER_PROFILES[tool];

    if (!buildArgs) {
      const err = new Error(
        `Unsupported tool for grading: "${tool}". Supported: ${Object.keys(GRADER_PROFILES).join(', ')}`
      );
      log.error(err.message);
      handle.emit('complete', {
        testId: testCase.id,
        specName,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
      } satisfies GradeResult);
      return;
    }

    const agentPath = resolveAgentPath();
    if (!agentPath) {
      const msg = 'Could not find agents/grader.md in the repository root.';
      log.error(msg);
      handle.emit('complete', {
        testId: testCase.id,
        specName,
        exitCode: 1,
        stdout: '',
        stderr: msg,
      } satisfies GradeResult);
      return;
    }

    void transcriptPath; // used in the prompt, passed via buildGraderPrompt

    const cliArgs = buildArgs(agentPath);
    const prompt = buildGraderPrompt(testCase, specName, timestamp);

    const resultsDir = path.join('.workspace', 'runs', timestamp, 'results');
    const graderMdLogPath = path.join(
      resultsDir,
      `${specName}.${testCase.id}.grader-transcript.md`
    );

    // Pre-seed the results file with the canonical schema. The grader will
    // Read this, fill in the null values, and Write it back.
    writeSeedResultsFile(resultsDir, specName, testCase);

    const { exitCode, stdout, stderr } = await spawnGrader(
      tool,
      cliArgs,
      prompt,
      {
        onOutput: (chunk) => handle.emit('output', chunk),
        mdLogPath: graderMdLogPath,
        setProcRef: (p) => {
          proc = p;
        },
      }
    );

    // Render the human-readable `.results.md` from the grader's JSON so the
    // TUI drill-in and report links see the same data the runs-list uses.
    // Failures here are non-fatal -- downstream code still reads the JSON.
    const jsonPath = path.join(
      resultsDir,
      `${specName}.${testCase.id}.results.json`
    );
    const mdPath = path.join(
      resultsDir,
      `${specName}.${testCase.id}.results.md`
    );
    if (fs.existsSync(jsonPath)) {
      try {
        const data = normalizeGraderJson(
          JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as unknown
        );
        fs.writeFileSync(mdPath, renderResultsMarkdown(data), 'utf-8');
      } catch (e) {
        log.warn(
          `Malformed grader JSON for ${testCase.id}: ${(e as Error).message}`
        );
      }
    }

    handle.emit('complete', {
      testId: testCase.id,
      specName,
      exitCode,
      stdout,
      stderr,
    } satisfies GradeResult);
  });

  return handle;
}

// -- Batch execution with concurrency -----------------------------------------

async function runBatch<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

// -- Main grading function ----------------------------------------------------

export interface GradeSpecsOptions {
  /** When true, suppresses all logger output (TUI mode). */
  silent?: boolean;
}

export async function gradeSpecs(
  specs: Spec[],
  config: SkillUnitConfig,
  timestamp: string,
  options?: GradeSpecsOptions
): Promise<void> {
  const silent = options?.silent ?? false;
  const gradeLog = silent
    ? {
        debug: () => {},
        verbose: () => {},
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
      }
    : log;

  const tool = config.runner.tool || 'claude';
  const concurrency = config.runner.concurrency || 5;

  const buildArgs = GRADER_PROFILES[tool];
  if (!buildArgs) {
    gradeLog.error(
      `Unsupported tool for grading: "${tool}". Supported: ${Object.keys(GRADER_PROFILES).join(', ')}`
    );
    return;
  }

  const agentPath = resolveAgentPath();
  if (!agentPath) {
    gradeLog.error('Could not find agents/grader.md in the repository root.');
    return;
  }

  const cliArgs = buildArgs(agentPath);

  // Build all grading tasks across all specs
  interface GradeTask {
    specName: string;
    testId: string;
    run: () => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  }

  const tasks: GradeTask[] = [];

  for (const spec of specs) {
    const specName =
      spec.frontmatter.name || path.basename(spec.path, '.spec.md');

    for (const tc of spec.testCases) {
      const transcriptPath = path.join(
        '.workspace',
        'runs',
        timestamp,
        'results',
        `${specName}.${tc.id}.transcript.md`
      );

      // Skip if no transcript (test may have been filtered or failed to run)
      if (!fs.existsSync(transcriptPath)) {
        gradeLog.warn(`Skipping ${tc.id}: no transcript at ${transcriptPath}`);
        continue;
      }

      const prompt = buildGraderPrompt(tc, specName, timestamp);

      const graderMdLogPath = path.join(
        '.workspace',
        'runs',
        timestamp,
        'results',
        `${specName}.${tc.id}.grader-transcript.md`
      );

      // Pre-seed the results file so the grader fills in nulls rather than
      // inventing the schema. Done upfront (before the batch runs) so tasks
      // can execute in any order.
      writeSeedResultsFile(
        path.join('.workspace', 'runs', timestamp, 'results'),
        specName,
        tc
      );

      tasks.push({
        specName,
        testId: tc.id,
        run: () =>
          spawnGrader(tool, cliArgs, prompt, { mdLogPath: graderMdLogPath }),
      });
    }
  }

  if (tasks.length === 0) {
    gradeLog.info('No test cases to grade.');
    return;
  }

  gradeLog.info(
    `Grading ${tasks.length} test case(s) with concurrency ${concurrency}`
  );

  // Execute in batches
  const totalBatches = Math.ceil(tasks.length / concurrency);

  await runBatch(
    tasks.map((task, globalIdx) => async () => {
      const batchNum = Math.floor(globalIdx / concurrency) + 1;
      const batchStart = Math.floor(globalIdx / concurrency) * concurrency;
      // Only log batch header for the first task in each batch
      if (globalIdx % concurrency === 0) {
        const batchEnd = Math.min(batchStart + concurrency, tasks.length);
        const batchIds = tasks
          .slice(batchStart, batchEnd)
          .map((t) => t.testId)
          .join(', ');
        gradeLog.info(`Batch ${batchNum}/${totalBatches}: ${batchIds}`);
      }

      const result = await task.run();

      if (result.exitCode === 0) {
        gradeLog.success(`  ${task.testId}: OK`);
      } else {
        gradeLog.error(`  ${task.testId}: FAIL(${result.exitCode})`);
        if (result.stderr) {
          const preview = result.stderr.substring(0, 500);
          gradeLog.debug(
            `  ${task.testId} stderr: ${preview}${result.stderr.length > 500 ? '...' : ''}`
          );
        }
      }

      return result;
    }),
    concurrency
  );

  gradeLog.info(`Graded ${tasks.length}/${tasks.length} test cases`);

  // Render the human-readable `.results.md` from each grader-produced
  // `.results.json`. The JSON is the source of truth; the markdown is derived
  // for the drill-in view and the report.md failure-detail links.
  const resultsDir = path.join('.workspace', 'runs', timestamp, 'results');
  let missing = 0;
  let malformed = 0;
  for (const task of tasks) {
    const jsonPath = path.join(
      resultsDir,
      `${task.specName}.${task.testId}.results.json`
    );
    const mdPath = path.join(
      resultsDir,
      `${task.specName}.${task.testId}.results.md`
    );
    if (!fs.existsSync(jsonPath)) {
      gradeLog.verbose(`Missing results.json for ${task.testId}: ${jsonPath}`);
      missing++;
      continue;
    }
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const raw = JSON.parse(content) as unknown;
      const data = normalizeGraderJson(raw);
      fs.writeFileSync(mdPath, renderResultsMarkdown(data), 'utf-8');
    } catch (e) {
      malformed++;
      gradeLog.warn(
        `Malformed results.json for ${task.testId}: ${(e as Error).message}`
      );
    }
  }

  if (missing > 0) {
    gradeLog.verbose(`${missing} results.json file(s) missing`);
  }
  if (malformed > 0) {
    gradeLog.warn(`${malformed} results.json file(s) malformed`);
  }
  if (missing === 0 && malformed === 0) {
    gradeLog.success('All result files written');
  }
}

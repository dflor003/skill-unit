#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

// ---------------------------------------------------------------------------
// skill-unit runner — executes test prompts in isolated workspaces
//
// Usage: node runner.js <manifest-path> [--keep-workspaces]
//
// Reads a manifest JSON file describing test cases, creates isolated
// workspaces from fixtures, copies the skill under test into each
// workspace, invokes the harness CLI for each prompt, captures responses,
// and writes a responses JSON file.
//
// The runner controls all CLI parameters for the harness to ensure
// proper isolation (no external skills, no MCPs, tool permissions
// explicitly allowlisted, file tools scoped to workspace directory).
// Users configure tool, model, and optionally allowed/disallowed tools
// via .skill-unit.yml and spec frontmatter.
//
// Directory structure:
//   .workspace/                        — repo root, gitignored
//     runs/{timestamp}/                — one folder per run
//       manifests/{spec}.manifest.json — manifest + progress files
//       results/{spec}.results.md      — graded results (written by evaluator)
//       logs/{spec}.{id}.log.jsonl     — raw CLI output
//       logs/{spec}.{id}.log.md        — formatted transcript
//       responses/{spec}.responses.json— raw responses
//     workspaces/{uuid}/               — ephemeral, per test case
//       work/                          — agent cwd, contains fixtures
//       plugin/                        — skill-under-test (--plugin-dir)
//
// Progress is written to a progress file for real-time status updates.
// ---------------------------------------------------------------------------

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  process.stderr.write(`[skill-unit ${ts}] ${msg}\n`);
}

// -- CLI argument profiles per harness tool ---------------------------------

const TOOL_PROFILES = {
  claude: (model, maxTurns, pluginDir, allowedTools, disallowedTools, workspacePath) => [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--max-turns", String(maxTurns),
    "--permission-mode", "dontAsk",
    ...(allowedTools.length ? ["--allowedTools", ...allowedTools] : []),
    ...(disallowedTools.length ? ["--disallowedTools", ...disallowedTools] : []),
    "--no-chrome",
    "--no-session-persistence",
    "--setting-sources", "local",
    "--strict-mcp-config",
    "--system-prompt", `You are working in the directory: ${workspacePath}\nYou MUST NOT read, write, or access any files outside this directory. All file operations (Read, Write, Edit, Glob, Grep, Bash) must target only files within this directory. Do not use parent directory traversal or absolute paths outside this directory.`,
    ...(model ? ["--model", model] : []),
    ...(pluginDir ? ["--plugin-dir", pluginDir] : []),
  ],
  // Future: add copilot, codex profiles here
};

// -- Workspace path scoping for file tools ----------------------------------

const FILE_TOOLS = new Set(["Read", "Write", "Edit", "Glob", "Grep"]);

// Rewrite bare file tool names to include workspace path restrictions.
// Tools with existing path patterns (e.g., "Read(/some/path/**)") pass through unchanged.
function scopeToolsToWorkspace(allowedTools, workspacePath) {
  return allowedTools.map((tool) => {
    if (FILE_TOOLS.has(tool)) {
      return `${tool}(${workspacePath}/**)`;
    }
    return tool;
  });
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
const keepWorkspaces = args.includes("--keep-workspaces");

if (!manifestPath) {
  process.stderr.write("Usage: node runner.js <manifest-path> [--keep-workspaces]\n");
  process.exit(1);
}

// -- Read manifest ----------------------------------------------------------

log(`Reading manifest: ${manifestPath}`);

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
} catch (err) {
  log(`ERROR: Failed to read manifest: ${err.message}`);
  process.exit(1);
}

const {
  "spec-name": specName,
  "fixture-path": rawFixturePath,
  "skill-path": rawSkillPath,
  timestamp,
  timeout: timeoutStr,
  runner,
  "test-cases": testCases,
} = manifest;

// Resolve all paths relative to the current working directory (repo root)
const cwd = process.cwd();
const fixturePath = rawFixturePath ? path.resolve(cwd, rawFixturePath) : null;
const skillPath = rawSkillPath ? path.resolve(cwd, rawSkillPath) : null;

if (!specName || !timestamp || !runner || !testCases) {
  log("ERROR: Invalid manifest — missing required fields (spec-name, timestamp, runner, test-cases)");
  process.exit(1);
}

// Resolve runner tool and build CLI args
const tool = runner.tool || "claude";
const model = runner.model || null;
const maxTurns = runner["max-turns"] || 10;

const buildArgs = TOOL_PROFILES[tool];
if (!buildArgs) {
  log(`ERROR: Unsupported runner tool: "${tool}". Supported: ${Object.keys(TOOL_PROFILES).join(", ")}`);
  process.exit(1);
}

log(`Spec: ${specName}`);
log(`Test cases: ${testCases.length}`);
log(`Tool: ${tool}${model ? ` (model: ${model})` : ""}`);
log(`CWD: ${cwd}`);
log(`Fixture path (resolved): ${fixturePath || "(none)"}`);
log(`Fixture exists: ${fixturePath ? fs.existsSync(fixturePath) : "n/a"}`);
log(`Skill path (resolved): ${skillPath || "(none)"}`);
log(`Skill exists: ${skillPath ? fs.existsSync(skillPath) : "n/a"}`);
log(`Timestamp: ${timestamp}`);

// Parse timeout string (e.g., "120s", "5m") into milliseconds
function parseTimeout(str) {
  if (!str) return 300000; // default 5m
  const match = str.match(/^(\d+)(s|m)?$/);
  if (!match) return 300000;
  const value = parseInt(match[1], 10);
  const unit = match[2] || "s";
  return unit === "m" ? value * 60000 : value * 1000;
}

const timeoutMs = parseTimeout(timeoutStr);
log(`Timeout per test: ${timeoutMs}ms`);

const allowedTools = runner["allowed-tools"] || [];
const disallowedTools = runner["disallowed-tools"] || [];
log(`Allowed tools: ${allowedTools.length ? allowedTools.join(", ") : "(none)"}`);
log(`Disallowed tools: ${disallowedTools.length ? disallowedTools.join(", ") : "(none)"}`);

// -- Helpers ----------------------------------------------------------------

function copyDirSync(src, dest) {
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

function rmSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureGitignore(dir, pattern) {
  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const contents = fs.readFileSync(gitignorePath, "utf-8");
    if (contents.split("\n").some((line) => line.trim() === pattern)) return;
  }
  fs.appendFileSync(gitignorePath, `${pattern}\n`);
}

function uuid() {
  return crypto.randomUUID();
}

// Install the skill under test as a plugin at the given path.
// Creates:
//   {pluginPath}/skills/{skill-name}/  — the skill files
//   {pluginPath}/.claude-plugin/plugin.json — bare plugin manifest
// Returns the plugin dir path to pass via --plugin-dir.
function installSkillPlugin(skillSrcPath, pluginPath) {
  if (!skillSrcPath || !fs.existsSync(skillSrcPath)) {
    log(`  WARNING: Skill path not found: ${skillSrcPath}`);
    return null;
  }

  const skillName = path.basename(skillSrcPath);

  // Copy skill into the plugin directory
  const skillsDest = path.join(pluginPath, "skills", skillName);
  copyDirSync(skillSrcPath, skillsDest);

  // Generate bare plugin manifest
  const pluginMetaDir = path.join(pluginPath, ".claude-plugin");
  fs.mkdirSync(pluginMetaDir, { recursive: true });
  const pluginJson = {
    name: "my-plugins",
    description: "Local plugin",
  };
  fs.writeFileSync(
    path.join(pluginMetaDir, "plugin.json"),
    JSON.stringify(pluginJson, null, 2),
    "utf-8"
  );

  return pluginPath;
}

// Run a CLI command asynchronously.
// Parses stream-json output: logs human-readable summary to stderr,
// writes full raw JSON events to a log file, extracts final assistant
// text as the response.
function runAsync(cmd, cliArgs, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cliArgs, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Open log files
    const logStream = options.logPath
      ? fs.createWriteStream(options.logPath, { flags: "w" })
      : null;
    const mdLogStream = options.mdLogPath
      ? fs.createWriteStream(options.mdLogPath, { flags: "w" })
      : null;

    // Write markdown log header
    if (mdLogStream) {
      mdLogStream.write(`# Test Log: ${options.testId || "unknown"}\n\n`);
      mdLogStream.write(`**Prompt:** ${options.prompt || "n/a"}\n\n`);
      mdLogStream.write(`---\n\n`);
    }

    let turnNumber = 0;
    let rawStdout = "";
    let lastAssistantText = "";
    let buffer = "";

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      rawStdout += chunk;
      buffer += chunk;

      // Write raw data to log file
      if (logStream) logStream.write(chunk);

      // Process complete lines (stream-json sends one JSON object per line)
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);

          if (event.type === "system" && event.subtype === "init") {
            // Log session init info
            if (mdLogStream) {
              mdLogStream.write(`**Model:** ${event.model || "unknown"}\n`);
              mdLogStream.write(`**Skills:** ${(event.skills || []).join(", ") || "none"}\n`);
              mdLogStream.write(`**CWD:** ${event.cwd || "unknown"}\n\n---\n\n`);
            }
          } else if (event.type === "assistant" && event.message) {
            turnNumber++;
            const content = event.message.content || [];
            const textParts = content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("");
            const toolUses = content.filter((c) => c.type === "tool_use");

            if (textParts || toolUses.length) {
              if (mdLogStream) {
                mdLogStream.write(`## Turn ${turnNumber} — Assistant\n\n`);
              }
            }

            if (textParts) {
              lastAssistantText = textParts;
              process.stderr.write(textParts);
              if (mdLogStream) {
                mdLogStream.write(`${textParts}\n\n`);
              }
            }

            for (const tu of toolUses) {
              process.stderr.write(`\n[tool: ${tu.name || "unknown"}]\n`);
              if (mdLogStream) {
                mdLogStream.write(`**Tool call:** \`${tu.name}\`\n`);
                mdLogStream.write("```json\n");
                mdLogStream.write(JSON.stringify(tu.input, null, 2));
                mdLogStream.write("\n```\n\n");
              }
            }
          } else if (event.type === "tool_result") {
            const output = event.output || "";
            const preview = output.substring(0, 200);
            if (preview) {
              process.stderr.write(`[result: ${preview}${output.length > 200 ? "..." : ""}]\n`);
            }
            if (mdLogStream) {
              mdLogStream.write(`**Tool result:**\n`);
              if (output.length > 500) {
                mdLogStream.write("```\n");
                mdLogStream.write(output.substring(0, 500));
                mdLogStream.write(`\n... (${output.length} chars total)\n`);
                mdLogStream.write("```\n\n");
              } else if (output) {
                mdLogStream.write("```\n");
                mdLogStream.write(output);
                mdLogStream.write("\n```\n\n");
              }
            }
          } else if (event.type === "result") {
            if (event.subtype === "success" && event.result) {
              lastAssistantText = event.result;
            }
            if (mdLogStream) {
              mdLogStream.write(`---\n\n`);
              mdLogStream.write(`**Result:** ${event.subtype || "unknown"}\n\n`);
            }
          }
        } catch (_) {
          // Not valid JSON — log as-is
          process.stderr.write(trimmed + "\n");
        }
      }
    });

    proc.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, options.timeout || 300000);

    proc.on("close", (code) => {
      clearTimeout(timer);

      // Write any remaining buffer to log
      if (logStream && buffer) logStream.write(buffer);
      if (logStream) logStream.end();
      if (mdLogStream) mdLogStream.end();

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          if (event.type === "result" && event.result) {
            lastAssistantText = event.result;
          }
        } catch (_) {
          // ignore
        }
      }

      const response = lastAssistantText || rawStdout.trim();

      resolve({
        stdout: response,
        exitCode: timedOut ? 124 : (code || 0),
        timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (logStream) logStream.end();
      if (mdLogStream) mdLogStream.end();
      reject(err);
    });
  });
}

// -- Setup ------------------------------------------------------------------

// All workspace artifacts live under .workspace/ at the repo root.
const workspaceRoot = path.join(cwd, ".workspace");
fs.mkdirSync(workspaceRoot, { recursive: true });
ensureGitignore(cwd, ".workspace/");

// Run-specific directories
const runDir = path.join(workspaceRoot, "runs", timestamp);
const manifestsDir = path.join(runDir, "manifests");
const logsDir = path.join(runDir, "logs");
const responsesDir = path.join(runDir, "responses");
const workspacesDir = path.join(workspaceRoot, "workspaces");

fs.mkdirSync(manifestsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(responsesDir, { recursive: true });
fs.mkdirSync(workspacesDir, { recursive: true });

log(`Workspace root: ${workspaceRoot}`);
log(`Run dir: ${runDir}`);

// -- Progress tracking ------------------------------------------------------

const progressPath = path.join(manifestsDir, `${specName}.progress.json`);

function writeProgress(data) {
  fs.writeFileSync(progressPath, JSON.stringify(data, null, 2), "utf-8");
}

// -- Main execution ---------------------------------------------------------

async function main() {
  const responses = {};
  const workspacePaths = [];
  const completedResults = [];

  writeProgress({
    status: "running",
    "spec-name": specName,
    total: testCases.length,
    completed: 0,
    current: testCases[0] ? testCases[0].id : null,
    results: [],
  });

  log("--- Starting test execution ---");

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testId = tc.id;
    const prompt = tc.prompt;
    const workspaceId = uuid();
    const workspaceBase = path.join(workspacesDir, workspaceId);
    const workspacePath = path.join(workspaceBase, "work");
    const pluginPath = path.join(workspaceBase, "plugin");
    workspacePaths.push(workspaceBase);

    log(`[${i + 1}/${testCases.length}] ${testId}: Creating workspace ${workspaceId}...`);

    writeProgress({
      status: "running",
      "spec-name": specName,
      total: testCases.length,
      completed: i,
      current: testId,
      results: completedResults,
    });

    // Create work directory from fixture
    if (fixturePath && fs.existsSync(fixturePath)) {
      copyDirSync(fixturePath, workspacePath);
      log(`[${i + 1}/${testCases.length}] ${testId}: Fixture copied to ${workspacePath}`);
    } else {
      fs.mkdirSync(workspacePath, { recursive: true });
      if (fixturePath) {
        log(`[${i + 1}/${testCases.length}] ${testId}: WARNING — fixture path not found: ${fixturePath}`);
      } else {
        log(`[${i + 1}/${testCases.length}] ${testId}: No fixture — empty workspace created`);
      }
    }

    // Install skill under test as a plugin (sibling to work dir)
    const pluginDir = skillPath ? installSkillPlugin(skillPath, pluginPath) : null;

    // Scope file tools to this test case's workspace path
    const scopedAllowed = scopeToolsToWorkspace(allowedTools, workspacePath);
    const cmdArgs = buildArgs(model, maxTurns, pluginDir, scopedAllowed, disallowedTools, workspacePath);
    log(`[${i + 1}/${testCases.length}] ${testId}: CLI args: ${tool} ${cmdArgs.join(" ")}`);

    // Log files
    const logPath = path.join(logsDir, `${specName}.${testId}.log.jsonl`);
    const mdLogPath = path.join(logsDir, `${specName}.${testId}.log.md`);

    log(`[${i + 1}/${testCases.length}] ${testId}: Executing prompt via ${tool}...`);
    log(`[${i + 1}/${testCases.length}] ${testId}: Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}"`);
    log(`[${i + 1}/${testCases.length}] ${testId}: Raw log: ${logPath}`);
    log(`[${i + 1}/${testCases.length}] ${testId}: Formatted log: ${mdLogPath}`);
    log(`[${i + 1}/${testCases.length}] ${testId}: --- agent output start ---`);

    const startTime = Date.now();
    let response = "";
    let exitCode = 0;

    try {
      const result = await runAsync(tool, cmdArgs, {
        cwd: workspacePath,
        input: prompt,
        timeout: timeoutMs,
        logPath,
        mdLogPath,
        testId,
        prompt,
      });
      response = result.stdout;
      exitCode = result.exitCode;

      if (result.timedOut) {
        log(`[${i + 1}/${testCases.length}] ${testId}: TIMED OUT after ${timeoutMs}ms`);
        response = response || `Error: Test timed out after ${timeoutMs}ms`;
      }
    } catch (err) {
      log(`[${i + 1}/${testCases.length}] ${testId}: EXCEPTION: ${err.message}`);
      response = `Error: ${err.message}`;
      exitCode = 1;
    }

    const durationMs = Date.now() - startTime;

    log(`\n[${i + 1}/${testCases.length}] ${testId}: --- agent output end ---`);

    responses[testId] = {
      response,
      "exit-code": exitCode,
      "duration-ms": durationMs,
    };

    const status = exitCode === 0 ? "OK" : `FAIL(${exitCode})`;
    completedResults.push({
      id: testId,
      status,
      "duration-ms": durationMs,
    });

    log(`[${i + 1}/${testCases.length}] ${testId}: ${status} (${(durationMs / 1000).toFixed(1)}s) — response: ${response.length} chars`);

    writeProgress({
      status: "running",
      "spec-name": specName,
      total: testCases.length,
      completed: i + 1,
      current: i + 1 < testCases.length ? testCases[i + 1].id : null,
      results: completedResults,
    });
  }

  log("--- Test execution complete ---");

  // -- Write responses file -------------------------------------------------

  const responsesFilename = `${specName}.responses.json`;
  const responsesPath = path.join(responsesDir, responsesFilename);
  fs.writeFileSync(responsesPath, JSON.stringify(responses, null, 2), "utf-8");
  log(`Responses written to: ${responsesPath}`);

  // -- Cleanup workspaces ---------------------------------------------------

  if (!keepWorkspaces) {
    log("Cleaning up workspaces...");
    for (const wp of workspacePaths) {
      log(`  Removing: ${wp}`);
      rmSync(wp);
    }
    log("Workspaces cleaned up");
  } else {
    log(`Workspaces kept at: ${workspacesDir}`);
  }

  // -- Final progress -------------------------------------------------------

  writeProgress({
    status: "complete",
    "spec-name": specName,
    total: testCases.length,
    completed: testCases.length,
    current: null,
    "responses-path": responsesPath,
    results: completedResults,
  });

  log("Done.");
  process.stdout.write(responsesPath + "\n");
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});

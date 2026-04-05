# GitHub Actions CI Setup

## Context

The repo has no CI. We need a GitHub Actions workflow that validates JS syntax, runs Node.js unit tests, and optionally runs skill-unit tests (which require the Claude CLI and cost API credits). Skill-unit tests are fully opt-in: they never run automatically.

## Workflow File

Create `.github/workflows/ci.yml` with two parallel jobs.

### Job 1: `build` (runs on every push and PR)

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: lts/*`
3. **Validate JS syntax** -- `find` all `.js` files under `skills/skill-unit/scripts/` and `tests/` and run `node -c` on them
4. **Run unit tests** -- `npm test`

### Job 2: `skill-tests` (opt-in only)

**Trigger conditions (any one):**
- `workflow_dispatch` with `run-skill-tests` input set to `true`
- PR has the `run-skill-tests` label

This job does NOT depend on the `build` job (they run in parallel). If the build fails, skill-test results are still useful for debugging.

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: lts/*`
3. **Install Claude CLI** -- `curl -fsSL https://claude.ai/install.sh | bash` then add `$HOME/.claude/bin` to `GITHUB_PATH`. Note: no official Anthropic marketplace action exists for CLI installation; `anthropics/claude-code-action` is for PR/issue automation only, not CLI setup. The curl installer is Anthropic's recommended method.
4. **Verify Claude CLI** -- `claude --version` (fast-fail canary)
5. **Run skill-unit tests** -- `npm run test:skills` with `ANTHROPIC_API_KEY` from secrets
6. **Upload test artifacts** -- `actions/upload-artifact@v4` on `.workspace/runs/` (always, even on failure; 14-day retention)

### Workflow-level settings

- **Concurrency**: `group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}` with `cancel-in-progress: true` to avoid piling up expensive runs on rapid pushes
- **Triggers**: `push` (branches: main), `pull_request`, `workflow_dispatch` with `run-skill-tests` boolean input

### Opt-in mechanism

The `skill-tests` job `if` condition:

```yaml
if: >-
  (github.event_name == 'workflow_dispatch' && inputs.run-skill-tests == true) ||
  (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-skill-tests'))
```

On plain `push` events, skill tests never run. On PRs, they only run with the label. On manual dispatch, they only run with the checkbox.

## Files to create/modify

- **Create**: `.github/workflows/ci.yml`
- No other files need modification

## Verification

1. Validate the workflow YAML: `node -c` won't work on YAML, but we can check syntax with `npx.cmd yaml-lint` or just review manually
2. Push to a branch, open a PR, confirm `build` job runs and passes
3. Add `run-skill-tests` label to the PR, confirm `skill-tests` job triggers
4. Use "Run workflow" button on Actions tab with `run-skill-tests` checked, confirm it triggers

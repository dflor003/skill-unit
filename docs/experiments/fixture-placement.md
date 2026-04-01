# Fixture Placement Experiment Plan

## Background

Test fixtures need to be placed somewhere the test-executor subagent can operate on them naturally, without revealing it's being tested. Three approaches to evaluate.

## Approach C: Copy to Repo Root (Phase 1 Default)

**How it works:**
1. Evaluator records current working directory state (list of files or `git status`).
2. Copies fixture folder contents to repo root.
3. Runs test-executor.
4. Removes all fixture files, restoring original state.

**Test procedure:**
1. Create a fixture folder with 3-5 files (e.g., `package.json`, `src/index.ts`, `README.md`).
2. Run a spec file that uses this fixture.
3. Verify: test-executor can read/write fixture files normally.
4. Verify: after test run, all fixture files are removed.
5. Verify: if test is interrupted (Ctrl+C), are fixture files left behind?
6. Verify: if fixture file conflicts with an existing repo file, what happens?

**Metrics:** Cleanup reliability, conflict handling, subagent behavior naturalness.

## Approach B: Git Worktree

**How it works:**
1. Evaluator creates a git worktree.
2. Copies fixtures into the worktree.
3. Spawns test-executor with `isolation: "worktree"`.
4. Worktree is cleaned up after the test.

**Test procedure:**
1. Same fixture folder as Approach C.
2. Run a spec file using worktree isolation.
3. Verify: test-executor operates in the worktree naturally.
4. Verify: no files left in main working directory.
5. Verify: worktree and temporary branch are cleaned up.
6. Measure: time overhead of worktree creation/cleanup vs. Approach C.

**Metrics:** Isolation quality, performance overhead, branch cleanup reliability.

## Approach D: Neutral Workspace Directory

**How it works:**
1. Evaluator creates `.workspace/` at repo root (`.gitignore`'d).
2. Copies fixtures into `.workspace/`.
3. Tells test-executor to operate in `.workspace/` as project root.
4. Cleans up `.workspace/` after the test.

**Test procedure:**
1. Same fixture folder as Approach C.
2. Run a spec file with workspace directory.
3. Verify: test-executor operates in `.workspace/` without confusion.
4. Verify: test-executor doesn't try to navigate to the actual repo root.
5. Verify: cleanup removes `.workspace/` contents.
6. Verify: `.workspace/` path doesn't leak "testing" context.

**Metrics:** Subagent behavior naturalness, path confusion incidents, cleanup reliability.

## Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Subagent realism | High | Does the subagent behave as it would in a real session? |
| Cleanup reliability | High | Are all fixture files removed consistently? |
| Performance | Medium | How much overhead does the approach add? |
| Conflict safety | Medium | What happens if fixtures overlap with real files? |
| Simplicity | Low | How complex is the implementation? |

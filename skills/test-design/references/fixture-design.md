# Fixture Design Guide

Guidance for designing filesystem fixtures for skill test cases. This reference is loaded when the target skill operates on filesystem state (reads files, modifies projects, depends on git state).

## When Fixtures Are Needed

A skill needs fixtures if it:

- Uses Read, Write, Edit, Glob, or Grep on project files
- References specific file types or directory structures (e.g., "reads `package.json`", "scans `src/`")
- Depends on git state (staged changes, branches, commit history)
- Has setup/teardown requirements for filesystem state

Skills that only produce text output, format data, or answer questions do not need fixtures.

## Fixture Folder Structure

Fixtures live in a companion folder alongside or near the spec file. The spec file's frontmatter `fixtures` field points to it:

```yaml
fixtures: ./fixtures/basic-project
```

The folder contains the exact file tree that will be copied into the working directory before tests run. Example:

```
tests/
  commit/
    commit-basics.spec.md
    fixtures/
      basic-repo/
        src/
          index.ts
        package.json
      empty-repo/
        .gitkeep
```

## Minimal Fixture Principle

Include only the files the skill actually needs — not a full project scaffold.

**Good:** A `package.json` with just the fields the skill reads, a `src/index.ts` with a few lines.

**Bad:** A complete Node.js project with `node_modules/`, full `tsconfig.json`, and dozens of source files the skill never touches.

Smaller fixtures are:
- Easier to review in PRs
- Faster to copy during test runs
- Less likely to collide with existing repo files
- More clearly communicating what state the test requires

## State-Specific Fixtures

When different test cases need different filesystem states, use one of:

**Separate fixture folders:** Each state gets its own folder. Use separate spec files with different `fixtures` fields, or restructure so each spec targets one state.

```
fixtures/
  has-config/
    config.yml
    src/app.ts
  missing-config/
    src/app.ts
  malformed-config/
    config.yml    # contains invalid YAML
    src/app.ts
```

**Setup scripts:** A single fixture folder with a setup script that modifies the state per test. Useful when the base files are the same but a small variation (e.g., staged vs. unstaged files) differentiates test cases.

## Git State Fixtures

Git state (staged files, branches, merge conflicts, commit history) cannot be captured in a static fixture folder — the `.git` directory is not portable.

Use **setup scripts** to create git state:

```bash
#!/bin/bash
# setup.sh — create a repo with staged changes
git init
git add .
git commit -m "initial commit"
echo "new content" >> src/index.ts
git add src/index.ts
# Now there are staged changes ready for a commit skill to act on
```

Common git states to script:
- Clean repo with history (init + commit)
- Repo with staged changes (add without commit)
- Repo with unstaged changes (modify after commit)
- Repo with merge conflict (two branches with conflicting changes)
- Repo with nothing to commit (clean working tree)

## Fixture Reuse

When multiple spec files test the same skill and share the same base state, place the shared fixture in a parent directory:

```
tests/
  commit/
    fixtures/
      basic-repo/          # shared by both spec files
    commit-basics.spec.md   # fixtures: ./fixtures/basic-repo
    commit-edge-cases.spec.md  # fixtures: ./fixtures/basic-repo
```

Do not duplicate fixture folders. If two specs need the same files, point both to the same folder.

## Cleanup Considerations

The skill-unit evaluator copies fixtures to the repo root or a workspace directory and handles cleanup after tests run. When designing fixtures:

- Use distinctive file and directory names that are unlikely to collide with existing repo files (e.g., `test-project/` rather than `src/`).
- Prefer nested directories over flat files at the root level.
- Document in the spec file (via a comment or the test case description) what files the fixture adds, so cleanup issues can be diagnosed.

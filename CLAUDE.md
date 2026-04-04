# Skill Unit Repo - AI Instructions

## Architecture Documentation

When making a significant architecture decision (new directory structures, isolation strategies, data flow changes, new subsystems), you MUST prompt the user to either create a new doc under `docs/architecture/` or update any existing relevant architecture docs. Do not let architecture decisions go undocumented.

## Validation Commands

When syntax-checking scripts (e.g., `node -c`), always use relative paths so auto-approve rules match:

```bash
# Correct
node -c skills/skill-unit/scripts/runner.js

# Wrong
node -c /c/Projects/skill-unit/skills/skill-unit/scripts/runner.js
```

## Git Workflow

Do NOT commit changes as you go. Let the user review and commit. Never run `git add` or `git commit` unless the user explicitly asks you to.

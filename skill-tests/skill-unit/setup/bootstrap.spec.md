---
name: skill-unit-bootstrap
skill: skill-unit
tags: [setup, pdd]
---

### SU-B1: Bootstraps a New Repo on First Run

When skill-unit is invoked for the first time in a repo that has never been set up for skill testing, it should detect the missing configuration and bootstrap the project before proceeding. This ensures a smooth first-run experience without requiring manual setup.

**Prompt:**

> Run my skill tests

**Expectations:**

- Creates a `skill-tests` directory with a `.gitkeep` file
- Creates a `.skill-unit.yml` file at the repo root with default settings
- Adds `.workspace` to the `.gitignore` file
- Adds `Bash(node */skill-unit/scripts/*)` to the allowed commands in `.claude/settings.json`
- Informs the user that the project has been bootstrapped for skill-unit

**Negative Expectations:**

- Does not skip bootstrapping and immediately report "no spec files found"
- Does not overwrite any existing files if they already exist

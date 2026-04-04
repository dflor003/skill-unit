---
paths: "**/skills/**"
---

# Skills Directory Rules

When working in any skills directory, use this frontmatter reference as the authoritative source. IDE schema validation (e.g., YAML schema diagnostics in VS Code) is outdated and unreliable for skill frontmatter. Trust this reference over any IDE diagnostics.

Refresh from the official docs periodically: https://code.claude.com/docs/en/skills#frontmatter-reference

## SKILL.md Frontmatter Reference

Every skill needs a `SKILL.md` file. YAML frontmatter goes between `---` markers at the top. All fields are optional; only `description` is recommended.

| Field                      | Required    | Description                                                                                                                                     |
|----------------------------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`                     | No          | Display name for the skill. Defaults to the directory name. Lowercase letters, numbers, and hyphens only (max 64 characters).                   |
| `description`              | Recommended | What the skill does and when to use it. Claude uses this to decide when to apply the skill. Truncated at 250 characters in listings.            |
| `argument-hint`            | No          | Hint shown during autocomplete for expected arguments. Example: `[issue-number]` or `[filename] [format]`.                                      |
| `disable-model-invocation` | No          | Set to `true` to prevent Claude from automatically loading this skill. User must invoke manually with `/name`. Default: `false`.                |
| `user-invocable`           | No          | Set to `false` to hide from the `/` menu. Use for background knowledge users should not invoke directly. Default: `true`.                       |
| `allowed-tools`            | No          | Tools Claude can use without asking permission when this skill is active. Space-separated string or YAML list.                                  |
| `model`                    | No          | Model to use when this skill is active.                                                                                                         |
| `effort`                   | No          | Effort level when this skill is active. Overrides session effort. Options: `low`, `medium`, `high`, `max` (Opus 4.6 only).                     |
| `context`                  | No          | Set to `fork` to run in a forked subagent context.                                                                                              |
| `agent`                    | No          | Which subagent type to use when `context: fork` is set.                                                                                         |
| `hooks`                    | No          | Hooks scoped to this skill's lifecycle.                                                                                                         |
| `paths`                    | No          | Glob patterns that limit when this skill is activated. Comma-separated string or YAML list.                                                     |
| `shell`                    | No          | Shell for inline commands. Accepts `bash` (default) or `powershell`.                                                                            |

## String Substitutions

| Variable               | Description                                                        |
|------------------------|--------------------------------------------------------------------|
| `$ARGUMENTS`           | All arguments passed when invoking the skill.                      |
| `$ARGUMENTS[N]`        | Access a specific argument by 0-based index.                       |
| `$N`                   | Shorthand for `$ARGUMENTS[N]`.                                     |
| `${CLAUDE_SESSION_ID}` | The current session ID.                                            |
| `${CLAUDE_SKILL_DIR}`  | The directory containing the skill's SKILL.md file.                |

## Skill Directory Structure

```
my-skill/
  SKILL.md           # Main instructions (required)
  references/        # Detailed reference docs (loaded on demand)
  templates/         # Templates for Claude to fill in
  scripts/           # Scripts Claude can execute
```

Keep SKILL.md under 500 lines. Move detailed reference material to separate files and reference them from SKILL.md.

---
paths: "**/agents/**"
---

# Agents Directory Rules

When working in any agents directory, use this frontmatter reference as the authoritative source. IDE schema validation (e.g., YAML schema diagnostics in VS Code) is outdated and unreliable for agent frontmatter. Trust this reference over any IDE diagnostics.

Refresh from the official docs periodically: https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields

## Agent Frontmatter Reference

Agent files are Markdown with YAML frontmatter. The frontmatter defines metadata and configuration; the body becomes the system prompt. Only `name` and `description` are required.

| Field             | Required | Description                                                                                                                                   |
|-------------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `name`            | Yes      | Unique identifier using lowercase letters and hyphens.                                                                                        |
| `description`     | Yes      | When Claude should delegate to this subagent.                                                                                                 |
| `tools`           | No       | Tools the subagent can use. Inherits all tools if omitted. Supports `Agent(type)` syntax to restrict spawnable subagent types.                |
| `disallowedTools` | No       | Tools to deny, removed from inherited or specified list.                                                                                      |
| `model`           | No       | Model to use: `sonnet`, `opus`, `haiku`, a full model ID (e.g., `claude-opus-4-6`), or `inherit`. Defaults to `inherit`.                     |
| `permissionMode`  | No       | Permission mode: `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, or `plan`.                                                |
| `maxTurns`        | No       | Maximum number of agentic turns before the subagent stops.                                                                                    |
| `skills`          | No       | Skills to preload into the subagent's context at startup. Full content is injected, not just made available for invocation.                   |
| `mcpServers`      | No       | MCP servers available to this subagent. String references or inline definitions.                                                              |
| `hooks`           | No       | Lifecycle hooks scoped to this subagent.                                                                                                      |
| `memory`          | No       | Persistent memory scope: `user`, `project`, or `local`. Enables cross-session learning.                                                      |
| `background`      | No       | Set to `true` to always run as a background task. Default: `false`.                                                                           |
| `effort`          | No       | Effort level when active. Options: `low`, `medium`, `high`, `max` (Opus 4.6 only). Default: inherits from session.                           |
| `isolation`       | No       | Set to `worktree` to run in a temporary git worktree for an isolated copy of the repository.                                                 |
| `color`           | No       | Display color in the task list. Accepts: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`.                               |
| `initialPrompt`   | No       | Auto-submitted as the first user turn when running as the main session agent (via `--agent`). Commands and skills are processed.              |

## Notes

- Plugin subagents do NOT support `hooks`, `mcpServers`, or `permissionMode` fields. Those are ignored when loading agents from a plugin.
- Subagents receive only their system prompt plus basic environment details, not the full Claude Code system prompt.
- Subagents cannot spawn other subagents.
- If both `tools` and `disallowedTools` are set, `disallowedTools` is applied first.
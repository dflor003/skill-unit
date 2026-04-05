# Test Design — Spec Authoring Skill Design Spec

## Overview

Test Design is a skill within the skill-unit plugin that helps users write and refine `*.spec.md` test files for AI agent skills. It reads a target skill's SKILL.md, asks targeted questions about gaps it can't infer, and incrementally generates test cases by category with refinement loops after each.

The skill handles both new spec creation and editing existing specs — running gap analysis or making targeted edits as needed.

## Goals

- **Low friction:** Users provide a skill name (or pick from a list) and the skill does the rest. No need to memorize the spec format or testing guidelines.
- **Coverage by default:** The incremental category workflow ensures specs hit minimum coverage requirements (activation, happy path, failure modes, boundary, graceful decline) without the user having to remember the checklist.
- **Realistic prompts:** Built-in prompt patterns guide generation toward natural, human-sounding prompts that don't leak implementation details or lead the agent toward expected answers.
- **Quality expectations:** Built-in expectation patterns ensure assertions are behavioral and independently verifiable, not implementation-specific.
- **Refinement loops:** Every category pauses for user feedback before moving on. Users stay in control of what gets written.
- **Edit support:** Existing specs can be improved via gap analysis or targeted edits without starting over.

## Plugin Placement

```
skills/
  skill-unit/            # existing — runs tests
  test-design/           # new — designs tests
    SKILL.md             # workflow + inline authoring guide
    references/
      fixture-design.md  # guidance for designing filesystem fixtures
```

The authoring guide (coverage checklist, prompt patterns, expectation patterns, spec format rules) lives inline in the SKILL.md because every invocation needs it — there is no scenario where only part of the guide is relevant.

The `references/` directory contains guidance that applies only to specific scenarios. `fixture-design.md` is loaded when the skill determines that the target skill operates on filesystem state and test cases will need fixtures.

The `plugin.json` does not need changes — the plugin already discovers skills by scanning `skills/`.

## Activation

### Invocation

- Slash command: `/test-design`, `/test-design <skill-name>`
- Natural language: "design tests for my skill", "write test cases for the commit skill", "help me write a spec file", "add tests for brainstorming"

### Skill Discovery

1. If a skill name is provided as an argument, search for it directly.
2. If no skill name is provided, scan both locations, collect all found skills, and present a numbered list for the user to pick.
3. If the skill name exists in both locations, ask the user which one.

Scan locations:
- `skills/*/SKILL.md` — plugin-level skills
- `.claude/skills/*/SKILL.md` — repo-level skills

The skill operates on one target skill at a time.

### Existing Spec Detection

After selecting a skill, search the configured test directory (from `.skill-unit.yml` or default `skill-tests/`) recursively for any `*.spec.md` files whose frontmatter `skill` field matches the selected skill name. Test directories can have arbitrarily nested folder structures — do not assume a flat `{test-dir}/{skill-name}/` layout.

- If one spec found: "I found an existing spec at `{path}`. Want me to review it for gaps, or are you looking to add something specific?"
- If multiple specs found: present the list and ask which one to work with, or offer to run gap analysis across all of them.
- If none found: proceed with new spec creation.

## New Spec Creation Workflow

### Step 1 — Read & Analyze

Read the target skill's SKILL.md. Extract:
- What the skill does (purpose, scope)
- How it activates (slash command, natural language triggers, auto-activation)
- What tools it uses
- What inputs it expects
- What outputs it produces
- Any explicit constraints or rules

### Step 2 — Targeted Questions

Ask a few focused questions about things that can't be inferred from the SKILL.md:
- Key failure modes or edge cases specific to this skill's domain
- Interaction style expectations (should it ask clarifying questions? what tone?)

If the target skill operates on filesystem state (reads files, modifies projects, expects specific directory structures), the skill loads `references/fixture-design.md` and asks about fixture needs — see the Fixture Design section below.

These are targeted gap-fillers, not an exhaustive interview. If the SKILL.md is thorough, this step may produce zero questions.

### Step 3 — ID Prefix

Auto-generate a 2-4 letter prefix from the skill name:
- "report-card" → `RC`
- "test-design" → `TD`
- "brainstorming" → `BRN`
- "skill-unit" → `SU`

If the abbreviation is ambiguous (e.g., multiple skills could map to the same prefix) or collides with an existing spec's prefix in the test directory, prompt the user to choose.

### Step 4 — Frontmatter

Generate the YAML frontmatter (`name`, `skill`, `tags`, and any applicable `fixtures`, `setup`, `teardown` fields) and present it to the user for approval before generating test cases.

### Step 5 — Incremental Category Generation

Generate test cases one category at a time, in this order:

| Order | Category | Purpose | When Required |
|-------|----------|---------|---------------|
| 1 | Activation tests | Verify the skill triggers (and doesn't trigger) on expected prompts | Always for auto-activating skills; slash-command-only skills test the command |
| 2 | Happy path tests | Core functionality with realistic, well-formed inputs | Always |
| 3 | Failure mode tests | Missing files, bad input, conflicting state, empty data | Always |
| 4 | Boundary tests | Edge cases at the limits of the skill's scope | When the skill has identifiable boundaries |
| 5 | Graceful decline tests | Requests adjacent to but outside the skill's purpose | Always |
| 6 | Interaction style tests | Tone, format, clarifying questions | When the skill has specific interaction expectations |

After each category, present the generated test cases and ask: "Want to refine any of these, add more, or move on to the next category?"

The user can:
- Edit a test case (prompt, expectations, negative expectations)
- Remove a test case
- Add a test case to this category
- Approve and move to the next category
- Skip a category entirely

### Step 6 — Write to Disk

Once all categories are approved, assemble the full spec file and write it to `{test-dir}/{skill-name}/{skill-name}.spec.md`. Create the directory and `results/` subfolder if they don't exist.

## Existing Spec Editing Workflow

### Mode A — Gap Analysis (no specific instructions)

1. Read the existing spec file.
2. Read the target skill's SKILL.md for current context.
3. Compare test cases against the coverage checklist:
   - Which categories are present? Which are missing or thin?
   - Are any prompts too leading, too specific, or using skill/tool names a real user wouldn't say?
   - Are any expectations testing implementation details rather than observable outcomes?
   - Are any expectations combining multiple checks into one bullet?
4. Present findings as a prioritized list.
5. Work through improvements one at a time with the user, same refinement loop as creation.
6. Write changes back to the existing file in place.

### Mode B — User-Directed Edits

1. User provides specific instructions: "add a failure mode test for when the config file is missing" or "the prompt in RC-2 is too leading, make it more natural."
2. Skill makes the targeted edit and presents the change for approval.
3. Continues the existing ID scheme — detects the prefix and uses the next available number for new test cases.
4. Write changes back to the existing file in place.

## Inline Authoring Guide

The following content lives as sections within the SKILL.md itself, not as separate reference files. It powers both generation quality and gap analysis.

### Coverage Checklist

Minimum coverage requirements by category:

| Category | Minimum | Applies When |
|----------|---------|--------------|
| Activation (positive) | 1 | Skill has auto-activation or slash command |
| Activation (negative) | 1 | Skill has auto-activation |
| Happy path | 1 | Always |
| Failure mode | 1 | Always |
| Boundary | 0 | Skill has identifiable scope boundaries |
| Graceful decline | 1 | Always |
| Interaction style | 0 | Skill has specific tone/format expectations |

### Prompt Patterns

**Good prompts** — natural, vague, human-sounding:
- "commit my changes" (not "run git commit on staged files")
- "how are the students doing?" (not "generate a report card using the report-card skill")
- "this test keeps failing, can you help?" (not "debug the test failure in test_auth.py line 42")

**Bad prompts** — leak implementation details or lead the agent:
- Mention skill names, tool names, or internal function names
- Describe the expected output format
- Include hints about what the correct answer is
- Use technical jargon a real user wouldn't use for this request

**Prompt variation** — across test cases in the same spec, vary:
- Formality level ("fix this" vs. "could you please address this issue")
- Specificity ("commit" vs. "commit the auth changes I just made")
- Intent framing ("do X" vs. "I need X done" vs. "can you X?")

### Expectation Patterns

**Good expectations** — behavioral, observable, independently verifiable:
- "Commit message references the nature of the changes"
- "Agent detected there was nothing to commit"
- "Output includes a markdown table"
- "Did not modify files outside the target directory"

**Bad expectations** — implementation-specific, compound, or vague:
- "Ran `git commit -m 'fix: auth bug'`" (too specific to implementation)
- "Produced correct output and formatted it properly" (compound — split into two)
- "Handled the error well" (vague — what does 'well' mean observably?)

**Negative expectations** — specific prohibited behaviors:
- "Did not run `git push`"
- "Did not create an empty commit"
- "Did not fabricate data that wasn't in the input"

### Spec Format Rules

Frontmatter fields, test case structure (`###` headings, `**Prompt:**` blockquotes, `**Expectations:**` and `**Negative Expectations:**` bullet lists), parsing rules, and `---` horizontal rules between test cases (optional, cosmetic). File extension is always `*.spec.md`.

Full format details are included in the SKILL.md so the skill generates structurally valid specs without needing to reference external files.

## Fixture Design

Many skills operate on filesystem state — reading config files, modifying source code, expecting specific directory structures. Test cases for these skills need fixtures: companion folders containing the exact file tree to copy into the working directory before tests run.

This concern is not always relevant (a skill that only formats text or answers questions needs no fixtures), so the guidance lives in `references/fixture-design.md` rather than inline in the SKILL.md. The skill loads this reference when it determines during Step 1 (Read & Analyze) that the target skill interacts with the filesystem.

### When Fixtures Are Needed

The skill looks for signals in the target SKILL.md:
- Uses Read, Write, Edit, Glob, or Grep tools on project files
- References specific file types or directory structures (e.g., "reads `package.json`", "scans `src/`")
- Has setup/teardown requirements
- Depends on git state (staged changes, branches, commit history)

### What `fixture-design.md` Covers

- **Fixture folder structure:** How to organize the companion folder, naming conventions, relationship to the spec file's frontmatter `fixtures` field.
- **Minimal fixture principle:** Include only the files the skill actually needs — not a full project scaffold. Smaller fixtures are easier to review and faster to copy.
- **State-specific fixtures:** When different test cases need different filesystem states (e.g., "empty repo" vs. "repo with staged changes"), use separate fixture folders or setup scripts to produce the variation.
- **Git state fixtures:** How to set up fixtures that require git state (staged files, branches, merge conflicts) — typically via setup scripts rather than static file copies, since `.git` state can't be captured in a fixture folder.
- **Fixture reuse:** When multiple spec files test the same skill, shared fixtures can live in a parent directory and be referenced from each spec's frontmatter.
- **Cleanup considerations:** Fixtures are copied to the repo root (Phase 1 approach). The evaluator handles cleanup, but fixture design should minimize collision risk with existing repo files by using distinctive names or nested directories.

### Workflow Integration

During Step 2 (Targeted Questions), if fixtures are needed, the skill asks:
- What filesystem state does the skill expect to find? (specific files, directory structures, git state)
- Are there multiple distinct states that different test cases need?
- Are there any files the skill modifies that need to be in a known starting state?

During Step 4 (Frontmatter), the skill includes the `fixtures` field pointing to the companion folder.

During Step 6 (Write to Disk), the skill creates the fixture folder alongside the spec file and populates it with the minimal file tree needed.

## ID Generation

### Rules

- Extract a 2-4 letter prefix from the skill name by taking uppercase initials or a short abbreviation.
- Sequential numbering starting at 1.
- When editing an existing spec, detect the current prefix and continue from the highest existing number + 1.
- If the auto-generated prefix collides with another spec's prefix in the same test directory, prompt the user.

### Examples

| Skill Name | Prefix |
|------------|--------|
| commit | `COM` |
| report-card | `RC` |
| brainstorming | `BRN` |
| skill-unit | `SU` |
| test-design | `TD` |
| claude-api | `CA` |

## Configuration

The skill reads `.skill-unit.yml` (if present) for the `test-dir` setting. Defaults to `skill-tests/` if not configured. No additional configuration specific to test-design is needed.

## Future Integration

Once this skill is stable, the main skill-unit evaluator skill will delegate to test-design for all spec authoring concerns. The testing guidelines and spec format references currently in `skills/skill-unit/references/` will be removed from the evaluator skill, which will instead instruct users to invoke `/test-design` when they need to create or edit spec files.

This change is deferred — the skill-unit skill is under active iteration in a separate session and should not be modified as part of this work.

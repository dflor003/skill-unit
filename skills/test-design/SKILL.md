---
name: test-design
description: ALWAYS use this skill when the user mentions writing, designing, creating, or adding test cases for any skill, even if they also describe specific behavior to test. Triggers on "write a test case", "write me a test case", "write test cases", "design tests", "create a spec file", "help me write tests", "add tests", "no tests yet", "/test-design", or any request that involves creating test cases, spec files, or test coverage for a skill. If the user says "write a test case for X that covers Y", this skill handles it, not the skill being tested.
---

# Test Design — Spec File Authoring Skill

Design, write, and refine `*.spec.md` test files for AI agent skills. This skill reads a target skill's SKILL.md, asks targeted questions about gaps it cannot infer, and incrementally generates test cases by category with refinement loops after each.

## Invocation

- **Slash command:** `/test-design`, `/test-design <skill-name>`
- **Natural language:** "design tests for my skill", "write test cases for the commit skill", "help me write a spec file", "add tests for brainstorming"

## Step 1: Select Target Skill

### If a skill name was provided as an argument

Search for a matching SKILL.md in both locations:

1. `skills/*/SKILL.md` — plugin-level skills in the current repo
2. `.claude/skills/*/SKILL.md` — repo-level skills

Use the Glob tool with patterns `skills/*/SKILL.md` and `.claude/skills/*/SKILL.md`. Match the directory name against the provided skill name (case-insensitive).

- If exactly one match is found, select it.
- If the skill exists in both locations, ask the user which one to use.
- If no match is found, enter the **Prompt-Driven Development Flow** (see below).

### If no skill name was provided

Scan both locations using the Glob tool. Collect all found skills and present a numbered list:

```
I found these skills:

1. skill-unit (plugin: skills/skill-unit/SKILL.md)
2. test-design (plugin: skills/test-design/SKILL.md)
3. report-card (repo: .claude/skills/report-card/SKILL.md)

Which skill would you like to design tests for?
```

Wait for the user to pick one before proceeding.

### One skill at a time

This skill operates on a single target skill per invocation. If the user wants to design tests for multiple skills, they invoke `/test-design` separately for each.

### Prompt-Driven Development Flow

This flow activates in two scenarios:

1. **The named skill does not exist** — the user asked to design tests for a skill name that has no matching SKILL.md anywhere in the project.
2. **The skill exists but the user describes functionality it doesn't have** — during Step 3 (Read & Analyze), if the user's request references capabilities, behaviors, or features that are not present in the skill's SKILL.md.

In either case, the agent MUST:

1. **Explicitly name what is happening.** Tell the user clearly:

   > "The skill `{name}` doesn't exist yet (or: `{name}` doesn't currently have {described capability})."
   > "I can help you use **prompt-driven development** — we'll define what the skill should do by writing test cases first, then you can build (or extend) the skill to pass them."

2. **Ask discovery questions** to understand the intended behavior. These replace the targeted questions in Step 4. Ask one at a time:

   - "What should this skill do? Describe it in a sentence or two."
   - "How should users invoke it — slash command, natural language, or auto-activation?"
   - "What inputs does it need from the user or environment?"
   - "What should it produce — text output, file changes, git operations?"
   - "What should it refuse to do or explicitly avoid?"
   - Additional questions as needed based on answers.

   Stop asking when you have enough context to write meaningful test cases. Do not ask questions whose answers would be obvious from what the user already said.

3. **Proceed to Step 5** (ID Prefix) and continue through the normal generation flow. The test cases now define the *intended* behavior of a skill that doesn't exist yet (or intended new behavior for an existing skill).

4. **After writing the spec file**, remind the user of the next step:

   > "These test cases define the behavior for `{name}`. You can now build (or update) the skill to pass them, then run `/skill-unit {name}` to verify."

**This flow is mandatory, not optional.** When either trigger condition is met, the agent must enter this flow rather than simply reporting "skill not found" or silently proceeding as if the feature exists. The goal is to make test-first development the natural path for new skills and new capabilities.

## Step 2: Detect Existing Specs

Read `.skill-unit.yml` from the repo root (if it exists) to determine the test directory. Default to `skill-tests/` if not configured.

Use the Glob tool to search recursively for `**/*.spec.md` under the test directory. For each found spec file, read its YAML frontmatter and check if the `skill` field matches the selected skill name. Skip files with missing or malformed frontmatter, or where the `skill` field is absent.

**If one spec file is found:**

> "I found an existing spec at `{path}`. Want me to review it for gaps, or are you looking to add something specific?"

- If the user wants a gap review → proceed to **Edit Mode A: Gap Analysis**.
- If the user has specific changes → proceed to **Edit Mode B: User-Directed Edits**.

**If multiple spec files are found:**

> "I found {N} spec files for {skill-name}:
>
> 1. `{path-1}` — {name from frontmatter}
> 2. `{path-2}` — {name from frontmatter}
>
> Which one would you like to work with, or should I review all of them for gaps?"

- If the user picks one → ask gap review or specific changes as above.
- If the user wants all reviewed → run gap analysis across all of them sequentially: for each spec file, present findings, work through improvements with the user, write changes back to that file, then move to the next spec file.

**If no spec files are found:**

Proceed to **New Spec Creation**.

## New Spec Creation

### Step 3: Read & Analyze Target Skill

Read the target skill's SKILL.md using the Read tool.

**Validate the frontmatter first.** Before extracting content, check that the YAML frontmatter between the `---` delimiters is valid:
- Every key-value pair must have a colon separator (e.g., `name: my-skill`, not `name my-skill`)
- Lists must have matching brackets (e.g., `tags: [a, b]`, not `tags: [a, b`)
- Strings with special characters must be properly quoted

If the frontmatter is malformed, **stop and inform the user.** Tell them what is wrong with the frontmatter and suggest how to fix it. Do not proceed with test case generation for a skill with invalid frontmatter.

If the frontmatter is valid, extract and summarize:

- **Purpose:** What the skill does in one sentence.
- **Activation:** How it triggers — slash command, natural language patterns, auto-activation.
- **Tools used:** Which tools the skill relies on (Read, Write, Bash, Glob, etc.).
- **Inputs:** What the skill expects from the user or environment.
- **Outputs:** What the skill produces (text response, file changes, git operations, etc.).
- **Constraints:** Any explicit rules or restrictions the skill follows.

**Check for prompt-driven development trigger:** Compare the user's original request against the skill's actual capabilities. If the user described functionality, behaviors, or features that are not present in the SKILL.md, enter the **Prompt-Driven Development Flow** (from Step 1). Do not silently proceed as if the capability exists — the user needs to know they are defining new behavior.

If the skill uses Read, Write, Edit, Glob, or Grep on project files, or references specific file types or directory structures, or depends on git state — note that **fixtures will likely be needed**. Use the Read tool to load this skill's `references/fixture-design.md` (path: `skills/test-design/references/fixture-design.md` from repo root) for guidance on fixture design and incorporate fixture questions into the targeted questions below.

### Step 4: Targeted Questions

Ask focused questions about things that cannot be inferred from the SKILL.md. These are gap-fillers, not an exhaustive interview. If the SKILL.md is thorough, this step may produce zero questions.

Possible questions (ask only what is relevant):

- "What are the key failure modes for this skill? For example, what happens when [specific scenario based on the skill's domain]?"
- "Should this skill ask clarifying questions when the user's intent is ambiguous, or should it make a best guess?"
- "Is there a specific tone or format the skill should maintain?" (Only ask if not already defined in the SKILL.md.)

If fixtures are needed (determined in Step 3):

- "What filesystem state does the skill expect to find? (specific files, directory structures, git state)"
- "Are there multiple distinct states that different test cases need?"
- "Are there any files the skill modifies that need to be in a known starting state?"

Ask questions **one at a time**. Wait for each answer before asking the next. Stop when you have enough context to generate good test cases.

### Step 5: ID Prefix

Auto-generate a 2-4 letter prefix from the skill name by taking uppercase initials or a short abbreviation:

| Skill Name | Prefix |
|------------|--------|
| commit | `COM` |
| report-card | `RC` |
| brainstorming | `BRN` |
| skill-unit | `SU` |
| test-design | `TD` |

Check for collisions: use the Glob tool to find all `*.spec.md` files in the test directory and read their `###` headings to collect existing prefixes. If the auto-generated prefix matches an existing one from a different skill, prompt the user:

> "The prefix `{PREFIX}` is already used by `{other-skill}`. What prefix would you like to use instead?"

Present the chosen prefix to the user for confirmation before proceeding.

### Step 6: Frontmatter

Generate the YAML frontmatter for the new spec file and present it to the user for approval:

```yaml
---
name: {skill-name}-tests
skill: {skill-name}
tags: [{inferred-tags}]
# Include these only if applicable:
# global-fixtures: ./fixtures/{fixture-folder-name}
# setup: setup.sh
# teardown: teardown.sh
---
```

Infer tags from the skill's characteristics:
- `slash-command` if the skill has a slash command
- `activation` if the skill has auto-activation triggers
- `fixtures` if fixture folders are needed
- Domain-specific tags inferred from the skill's purpose

Present the frontmatter and ask: "Does this look right, or would you like to change anything?"

Wait for approval before proceeding to test case generation.

### Step 7: Incremental Category Generation

Generate test cases one category at a time, in this order:

| Order | Category | Purpose | When to Include |
|-------|----------|---------|-----------------|
| 1 | Activation tests | Verify the skill triggers (and doesn't trigger) on expected prompts | Always for auto-activating skills; slash-command-only skills test the command |
| 2 | Happy path tests | Core functionality with realistic, well-formed inputs | Always |
| 3 | Failure mode tests | Missing files, bad input, conflicting state, empty data | Always |
| 4 | Boundary tests | Edge cases at the limits of the skill's scope | When the skill has identifiable scope boundaries |
| 5 | Graceful decline tests | Requests adjacent to but outside the skill's purpose | Always |
| 6 | Interaction style tests | Tone, format, clarifying questions | When the skill has specific interaction expectations |

**For each category:**

1. Determine if the category applies to this skill. If not, skip it silently.
2. Generate 1-3 test cases for the category. Use the ID prefix from Step 5 and number sequentially across all categories (e.g., `COM-1`, `COM-2` in activation, `COM-3`, `COM-4` in happy path).
3. Present the test cases in the spec file format:

```markdown
### {PREFIX}-{N}: {Human-Readable Descriptive Title}

{Plain-text purpose statement explaining why this test exists and what risk it guards against.}

**Fixtures:**
- {./path/to/fixture — only if this test needs fixtures beyond global-fixtures}

**Prompt:**
> {natural, human-sounding prompt}

**Expectations:**
- {observable outcome}
- {observable outcome}

**Negative Expectations:**
- {specific prohibited behavior}
```

The `**Fixtures:**` section is optional. Include it only when a test case needs additional fixture state beyond what `global-fixtures` provides. Per-test fixtures are layered on top of global fixtures.

4. After presenting the category's test cases, ask:

> "Want to refine any of these, add more, or move on to {next-category}?"

5. The user can:
   - **Edit** a test case — they describe the change, you regenerate that test case.
   - **Remove** a test case — drop it from the spec.
   - **Add** a test case — generate a new one in this category.
   - **Approve** — move to the next category.
   - **Skip** — skip the entire next category.

6. Repeat the refinement loop until the user approves the category.

**Prompt quality rules** (apply to every generated prompt):

- Write from the human perspective — vague, incomplete, natural language.
- NEVER include skill names, tool names, or internal function names.
- NEVER describe the expected output format.
- NEVER include hints about what the correct answer is.
- Vary formality, specificity, and intent framing across test cases.
- For single-turn tests, front-load project context so the agent can skip discovery steps. Instead of "write tests for csv", write "There's a csv skill in this project but no tests yet. Write me a test case that covers X." This prevents the agent from burning turns exploring the codebase.

Good: "commit my changes", "how are the students doing?", "this test keeps failing, can you help?"
Bad: "use the commit skill", "generate a report card using the report-card skill", "run git commit on staged files"

**Expectation quality rules** (apply to every generated expectation):

- Describe observable outcomes, not implementation details.
- Each expectation is independently verifiable — one check per bullet.
- Prefer behavioral assertions over tool-call assertions.
- Negative expectations name specific prohibited behaviors.
- When an expectation checks a specific section of the output (e.g., only the Prompt, not the Expectations), say so explicitly. The grader sees the full transcript, so "does not mention X" is ambiguous if X appears in one section but not another. Write: "Inside the generated test case, the **Prompt** section does not mention X."
- Skill internals (specific values, fallback behaviors, config names) are fine to reference in expectations, since that is how you verify correct behavior. They must NOT appear in prompts, since that leaks the answer to the agent under test.

Good: "Commit message references the nature of the changes"
Bad: "Ran `git commit -m 'fix: auth bug'`"

**Prompt variation** — across test cases in the same spec, vary:

- Formality level ("fix this" vs. "could you please address this issue")
- Specificity ("commit" vs. "commit the auth changes I just made")
- Intent framing ("do X" vs. "I need X done" vs. "can you X?")

### Step 8: Write to Disk

Once all categories have been approved:

1. Assemble the full spec file: frontmatter block + all approved test cases separated by `---` horizontal rules.
2. Determine the output path: `{test-dir}/{skill-name}/{skill-name}.spec.md`
   - `{test-dir}` comes from `.skill-unit.yml` or defaults to `skill-tests/`.
   - `{skill-name}` is the directory name of the target skill.
3. Create the directory if it does not exist. Also create a `results/` subfolder inside it.
4. If fixtures are needed, create the fixture folder at the path specified in frontmatter and populate it with the minimal file tree discussed during targeted questions.
5. Write the spec file using the Write tool.
6. Confirm to the user:

> "Spec file written to `{path}`. Created {N} test cases across {M} categories."
> "You can run these tests with `/skill-unit {skill-name}`."

If fixture folders were created, also note:

> "Fixture folder created at `{fixture-path}`. Review and adjust the fixture files as needed — they contain the minimal structure we discussed."

## Edit Existing Spec

When an existing spec file is found in Step 2, the skill enters one of two edit modes based on the user's response.

### Edit Mode A: Gap Analysis

Used when the user asks for a review without specific instructions.

1. **Read the spec file** using the Read tool.
2. **Read the target skill's SKILL.md** using the Read tool.
3. **Compare test cases against the coverage checklist** (see Inline Authoring Guide below):
   - Which categories are present? Which are missing or have fewer than the minimum?
   - Are any test names in `lower-kebab-case` instead of human-readable Title Case?
   - Are any test cases missing a purpose statement between the heading and the Prompt?
   - Are any prompts too leading, too specific, or using skill/tool names a real user wouldn't say?
   - Are any expectations testing implementation details rather than observable outcomes?
   - Are any expectations combining multiple checks into one bullet?
   - Are any negative expectations vague rather than naming specific prohibited behaviors?
4. **Present findings** as a prioritized list:

> "Here's what I found in `{spec-file}`:
>
> **Missing coverage:**
> - No failure mode tests (minimum: 1)
> - No graceful decline tests (minimum: 1)
>
> **Prompt quality issues:**
> - {PREFIX}-{N}: Prompt mentions the skill name — rewrite to be more natural
>
> **Expectation quality issues:**
> - {PREFIX}-{N}: Expectation 'Ran `git commit -m ...`' tests implementation detail — rewrite as behavioral assertion
> - {PREFIX}-{N}: Expectation combines two checks — split into separate bullets
>
> Want me to work through these one at a time?"

5. **Work through improvements** one at a time with the same refinement loop as new spec creation. For each finding, present the proposed change and wait for approval.
6. **Write changes** back to the existing file in place using the Write tool (rewrite the entire file with changes applied).

### Edit Mode B: User-Directed Edits

Used when the user has specific changes in mind.

1. **Read the spec file** using the Read tool.
2. **Apply the requested change:**
   - If adding a test case: detect the existing ID prefix from `###` headings, find the highest number, and use the next sequential number.
   - If editing a test case: regenerate the specific test case based on the user's instructions.
   - If removing a test case: drop it from the spec.
   - If modifying a prompt or expectation: make the targeted edit.
3. **Present the change** for approval before writing.
4. **Write changes** back to the existing file in place using the Write tool.

For new test cases, follow the same prompt and expectation quality rules as new spec creation.

## Inline Authoring Guide

This guide is used during both new spec creation and gap analysis. It defines the quality standards for generated test cases and the coverage checklist for evaluating existing specs.

### Coverage Checklist

Minimum coverage requirements by category. Use this during gap analysis to identify missing or thin categories.

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

**Single-turn prompts** — when tests run as a single prompt/response, front-load project context so the agent skips discovery:

- Good: "There's a csv skill in this project but no tests yet. Write me a test case that covers X."
- Bad: "write tests for csv" (agent wastes turns exploring the codebase)

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

**Scope precision** — when an expectation applies to a specific part of the output, say so:

- Good: "Inside the generated test case, the **Prompt** section does not mention Col1"
- Bad: "Does not mention Col1" (ambiguous if Col1 appears in expectations but not the prompt)

**Prompts vs. expectations boundary** — skill internals (specific values, fallback behaviors, config names) are allowed in expectations because that is how you verify correct behavior. They must NOT appear in prompts because that leaks the answer to the agent under test.

**Negative expectations** — specific prohibited behaviors:

- "Did not run `git push`"
- "Did not create an empty commit"
- "Did not fabricate data that wasn't in the input"

### Spec Format Rules

All generated spec files must follow this exact structure.

**Frontmatter:** YAML block delimited by `---` at the top of the file.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Human-readable name for the test suite |
| `skill` | No | string | Skill being tested (always emitted during generation; used for spec detection) |
| `tags` | No | list | Tags for filtering test runs |
| `timeout` | No | duration | Per-test timeout (e.g., `90s`) |
| `global-fixtures` | No | path | Path to fixture folder copied for every test case, relative to spec file directory |
| `setup` | No | filename | Script to run before tests |
| `teardown` | No | filename | Script to run after tests |

**Test case structure:**

```markdown
### {ID}: {Human-Readable Descriptive Title}

{Purpose statement — a plain-text sentence or two explaining why this test exists
and what risk or gap it guards against. This goes before the Prompt so the reader
understands the test's intent before seeing the mechanics.}

**Fixtures:**
- {./path/to/fixture — optional, only when this test needs additional fixtures}

**Prompt:**
> {prompt text — multi-line prompts use continued blockquote lines}

**Expectations:**
- {observable outcome — one per bullet}

**Negative Expectations:**
- {specific prohibited behavior — one per bullet}
```

**Rules:**

- Test cases are delimited by `###` headings.
- ID is everything before the first colon in the heading; name is everything after (trimmed).
- **Test names** use natural, human-readable titles in Title Case — not `lower-kebab-case`. The title should convey the test's purpose at a glance (e.g., "Asks the User Before Overwriting an Existing Spec" not `asks-before-overwriting`).
- **Purpose statement** is required for every test case. It appears as plain text between the heading and the `**Prompt:**` label. It explains *why* the test exists — what behavior it validates, what failure it prevents, or what design intent it captures.
- **Fixtures** section is optional per test case. It is a bullet list of fixture paths, layered on top of `global-fixtures` from frontmatter. Paths are relative to the spec file's directory.
- Prompt is the blockquote content under `**Prompt:**`. Leading `> ` markers are stripped.
- Expectations and Negative Expectations are bullet lists under their respective `**bold labels**`.
- `---` horizontal rules between test cases are optional (cosmetic).
- File extension is always `*.spec.md`.
- Negative Expectations section is optional per test case.

## Troubleshooting

When a user's test cases are failing and they need help diagnosing the problem, load this skill's `references/troubleshooting.md` (path: `skills/test-design/references/troubleshooting.md` from repo root) for common failure modes and fixes.

# Test Design Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a skill within the skill-unit plugin that helps users write and refine `*.spec.md` test files through incremental category generation with refinement loops.

**Architecture:** Single SKILL.md file at `skills/test-design/SKILL.md` containing the full workflow and inline authoring guide. One reference file at `skills/test-design/references/fixture-design.md` loaded conditionally when the target skill operates on filesystem state. No agents, no hooks, no scripts — this is a purely conversational skill.

**Tech Stack:** Markdown skill definition, YAML frontmatter parsing, Glob/Read/Write tools for skill discovery and spec file I/O.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `skills/test-design/SKILL.md` | Skill workflow + inline authoring guide |
| Create | `skills/test-design/references/fixture-design.md` | Conditional guidance for fixture folder design |

No modifications to existing files. The skill-unit evaluator skill is under active iteration elsewhere and must not be touched.

---

### Task 1: Create the SKILL.md Frontmatter and Description Block

**Files:**
- Create: `skills/test-design/SKILL.md`

This task writes the frontmatter (name, description for activation matching) and the top-level overview section. The description field is critical — it controls when the harness activates this skill.

- [ ] **Step 1: Write the frontmatter and overview**

```markdown
---
name: test-design
description: This skill should be used when the user asks to "design tests", "write test cases", "create a spec file", "help me write tests for my skill", "add tests for a skill", "/test-design", or mentions test case design, spec file authoring, or test coverage for a skill. It guides incremental creation and refinement of *.spec.md test files for the skill-unit framework.
---

# Test Design — Spec File Authoring Skill

Design, write, and refine `*.spec.md` test files for AI agent skills. This skill reads a target skill's SKILL.md, asks targeted questions about gaps it cannot infer, and incrementally generates test cases by category with refinement loops after each.

## Invocation

- **Slash command:** `/test-design`, `/test-design <skill-name>`
- **Natural language:** "design tests for my skill", "write test cases for the commit skill", "help me write a spec file", "add tests for brainstorming"
```

Write this to `skills/test-design/SKILL.md`.

- [ ] **Step 2: Verify the file exists and frontmatter parses**

Run: `head -5 skills/test-design/SKILL.md`
Expected: The `---` delimiters and `name: test-design` field are visible.

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add skill frontmatter and overview"
```

---

### Task 2: Add the Skill Discovery Section

**Files:**
- Modify: `skills/test-design/SKILL.md`

This section tells the skill how to find the target skill the user wants to test. It scans both plugin-level and repo-level skill directories.

- [ ] **Step 1: Append the skill discovery section**

Append after the Invocation section:

```markdown
## Step 1: Select Target Skill

### If a skill name was provided as an argument

Search for a matching SKILL.md in both locations:

1. `skills/*/SKILL.md` — plugin-level skills in the current repo
2. `.claude/skills/*/SKILL.md` — repo-level skills

Use the Glob tool with patterns `skills/*/SKILL.md` and `.claude/skills/*/SKILL.md`. Match the directory name against the provided skill name (case-insensitive).

- If exactly one match is found, select it.
- If the skill exists in both locations, ask the user which one to use.
- If no match is found, inform the user and list available skills.

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
```

- [ ] **Step 2: Read the file to verify the section was appended correctly**

Run: `grep -n "## Step 1" skills/test-design/SKILL.md`
Expected: Line containing `## Step 1: Select Target Skill`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add skill discovery and selection logic"
```

---

### Task 3: Add the Existing Spec Detection Section

**Files:**
- Modify: `skills/test-design/SKILL.md`

After selecting a skill, the skill checks whether spec files already exist for it. This determines whether to enter create mode or edit mode.

- [ ] **Step 1: Append the existing spec detection section**

Append after the skill discovery section:

```markdown
## Step 2: Detect Existing Specs

Read `.skill-unit.yml` from the repo root (if it exists) to determine the test directory. Default to `tests/` if not configured.

Use the Glob tool to search recursively for `**/*.spec.md` under the test directory. For each found spec file, read its YAML frontmatter and check if the `skill` field matches the selected skill name.

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
- If the user wants all reviewed → run gap analysis across all of them sequentially.

**If no spec files are found:**

Proceed to **New Spec Creation**.
```

- [ ] **Step 2: Verify the section was appended**

Run: `grep -n "## Step 2" skills/test-design/SKILL.md`
Expected: Line containing `## Step 2: Detect Existing Specs`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add existing spec detection with recursive search"
```

---

### Task 4: Add the New Spec Creation Workflow — Read, Analyze, and ID Prefix

**Files:**
- Modify: `skills/test-design/SKILL.md`

This covers Steps 3-5 of the overall workflow: reading the target SKILL.md, asking targeted questions, and generating the ID prefix.

- [ ] **Step 1: Append the new spec creation workflow start**

Append after the existing spec detection section:

```markdown
## New Spec Creation

### Step 3: Read & Analyze Target Skill

Read the target skill's SKILL.md using the Read tool. Extract and summarize:

- **Purpose:** What the skill does in one sentence.
- **Activation:** How it triggers — slash command, natural language patterns, auto-activation.
- **Tools used:** Which tools the skill relies on (Read, Write, Bash, Glob, etc.).
- **Inputs:** What the skill expects from the user or environment.
- **Outputs:** What the skill produces (text response, file changes, git operations, etc.).
- **Constraints:** Any explicit rules or restrictions the skill follows.

If the skill uses Read, Write, Edit, Glob, or Grep on project files, or references specific file types or directory structures, or depends on git state — note that **fixtures will likely be needed**. Load `references/fixture-design.md` for guidance on fixture design and incorporate fixture questions into the targeted questions below.

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
```

- [ ] **Step 2: Verify the section was appended**

Run: `grep -n "## New Spec Creation" skills/test-design/SKILL.md`
Expected: Line containing `## New Spec Creation`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add skill analysis, targeted questions, and ID prefix generation"
```

---

### Task 5: Add the Frontmatter Generation and Category Generation Workflow

**Files:**
- Modify: `skills/test-design/SKILL.md`

This is the core of the skill — generating the frontmatter for approval, then incrementally generating test cases by category with refinement loops.

- [ ] **Step 1: Append the frontmatter and category generation sections**

Append after the ID prefix section:

```markdown
### Step 6: Frontmatter

Generate the YAML frontmatter for the new spec file and present it to the user for approval:

```yaml
---
name: {skill-name}-tests
skill: {skill-name}
tags: [{inferred-tags}]
# Include these only if applicable:
# fixtures: ./fixtures/{fixture-folder-name}
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
### {PREFIX}-{N}: {descriptive-name}

**Prompt:**
> {natural, human-sounding prompt}

**Expectations:**
- {observable outcome}
- {observable outcome}

**Negative Expectations:**
- {specific prohibited behavior}
```

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

Good: "commit my changes", "how are the students doing?", "this test keeps failing, can you help?"
Bad: "use the commit skill", "generate a report card using the report-card skill", "run git commit on staged files"

**Expectation quality rules** (apply to every generated expectation):

- Describe observable outcomes, not implementation details.
- Each expectation is independently verifiable — one check per bullet.
- Prefer behavioral assertions over tool-call assertions.
- Negative expectations name specific prohibited behaviors.

Good: "Commit message references the nature of the changes"
Bad: "Ran `git commit -m 'fix: auth bug'`"

**Prompt variation** — across test cases in the same spec, vary:

- Formality level ("fix this" vs. "could you please address this issue")
- Specificity ("commit" vs. "commit the auth changes I just made")
- Intent framing ("do X" vs. "I need X done" vs. "can you X?")
```

- [ ] **Step 2: Verify the sections were appended**

Run: `grep -n "### Step 6\|### Step 7" skills/test-design/SKILL.md`
Expected: Lines containing `### Step 6: Frontmatter` and `### Step 7: Incremental Category Generation`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add frontmatter generation and incremental category workflow"
```

---

### Task 6: Add the Write to Disk Section

**Files:**
- Modify: `skills/test-design/SKILL.md`

After all categories are approved, assemble and write the spec file.

- [ ] **Step 1: Append the write-to-disk section**

Append after the category generation section:

```markdown
### Step 8: Write to Disk

Once all categories have been approved:

1. Assemble the full spec file: frontmatter block + all approved test cases separated by `---` horizontal rules.
2. Determine the output path: `{test-dir}/{skill-name}/{skill-name}.spec.md`
   - `{test-dir}` comes from `.skill-unit.yml` or defaults to `tests/`.
   - `{skill-name}` is the directory name of the target skill.
3. Create the directory if it does not exist. Also create a `results/` subfolder inside it.
4. If fixtures are needed, create the fixture folder at the path specified in frontmatter and populate it with the minimal file tree discussed during targeted questions.
5. Write the spec file using the Write tool.
6. Confirm to the user:

> "Spec file written to `{path}`. Created {N} test cases across {M} categories."
> "You can run these tests with `/skill-unit {skill-name}`."

If fixture folders were created, also note:

> "Fixture folder created at `{fixture-path}`. Review and adjust the fixture files as needed — they contain the minimal structure we discussed."
```

- [ ] **Step 2: Verify the section was appended**

Run: `grep -n "### Step 8" skills/test-design/SKILL.md`
Expected: Line containing `### Step 8: Write to Disk`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add write-to-disk section for spec file output"
```

---

### Task 7: Add the Edit Mode Sections

**Files:**
- Modify: `skills/test-design/SKILL.md`

Two edit modes: gap analysis (automatic review) and user-directed edits.

- [ ] **Step 1: Append the edit mode sections**

Append after the write-to-disk section:

```markdown
## Edit Existing Spec

When an existing spec file is found in Step 2, the skill enters one of two edit modes based on the user's response.

### Edit Mode A: Gap Analysis

Used when the user asks for a review without specific instructions.

1. **Read the spec file** using the Read tool.
2. **Read the target skill's SKILL.md** using the Read tool.
3. **Compare test cases against the coverage checklist** (see Inline Authoring Guide below):
   - Which categories are present? Which are missing or have fewer than the minimum?
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
```

- [ ] **Step 2: Verify the sections were appended**

Run: `grep -n "## Edit Existing Spec\|### Edit Mode" skills/test-design/SKILL.md`
Expected: Lines for `## Edit Existing Spec`, `### Edit Mode A: Gap Analysis`, `### Edit Mode B: User-Directed Edits`

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add gap analysis and user-directed edit modes"
```

---

### Task 8: Add the Inline Authoring Guide

**Files:**
- Modify: `skills/test-design/SKILL.md`

This is the reference material that lives inline — coverage checklist, prompt patterns, expectation patterns, and spec format rules. It powers both generation quality and gap analysis.

- [ ] **Step 1: Append the inline authoring guide**

Append after the edit mode sections:

```markdown
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

All generated spec files must follow this exact structure.

**Frontmatter:** YAML block delimited by `---` at the top of the file.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Human-readable name for the test suite |
| `skill` | No | string | Skill being tested (informational) |
| `tags` | No | list | Tags for filtering test runs |
| `timeout` | No | duration | Per-test timeout (e.g., `90s`) |
| `fixtures` | No | path | Path to fixture folder, relative to spec file directory |
| `setup` | No | filename | Script to run before tests |
| `teardown` | No | filename | Script to run after tests |

**Test case structure:**

```markdown
### {ID}: {name}

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
- Prompt is the blockquote content under `**Prompt:**`. Leading `> ` markers are stripped.
- Expectations and Negative Expectations are bullet lists under their respective `**bold labels**`.
- `---` horizontal rules between test cases are optional (cosmetic).
- File extension is always `*.spec.md`.
- Negative Expectations section is optional per test case.
```

- [ ] **Step 2: Verify the authoring guide was appended**

Run: `grep -n "## Inline Authoring Guide\|### Coverage Checklist\|### Prompt Patterns\|### Expectation Patterns\|### Spec Format Rules" skills/test-design/SKILL.md`
Expected: Lines for all five headings.

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/SKILL.md
git commit -m "feat(test-design): add inline authoring guide — coverage, prompts, expectations, format"
```

---

### Task 9: Create the Fixture Design Reference

**Files:**
- Create: `skills/test-design/references/fixture-design.md`

Conditional reference loaded when the target skill operates on filesystem state.

- [ ] **Step 1: Write the fixture design reference**

```markdown
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
```

Write this to `skills/test-design/references/fixture-design.md`.

- [ ] **Step 2: Verify the file exists**

Run: `ls skills/test-design/references/`
Expected: `fixture-design.md` is listed.

- [ ] **Step 3: Commit**

```bash
git add skills/test-design/references/fixture-design.md
git commit -m "feat(test-design): add fixture design reference for filesystem-dependent skills"
```

---

### Task 10: Final Review — Read the Complete SKILL.md End to End

**Files:**
- Read: `skills/test-design/SKILL.md`
- Read: `skills/test-design/references/fixture-design.md`

- [ ] **Step 1: Read the complete SKILL.md**

Run: Read `skills/test-design/SKILL.md` from start to finish.

Verify:
- Frontmatter `name` and `description` are present and well-formed.
- All sections flow logically: Invocation → Step 1 (Select) → Step 2 (Detect) → New Spec Creation (Steps 3-8) → Edit Modes → Inline Authoring Guide.
- No placeholder text ("TBD", "TODO", "fill in").
- Step numbers are sequential and consistent.
- All references to the coverage checklist, prompt patterns, and expectation patterns point to the correct inline section names.
- The fixture design reference is mentioned in Step 3 (Read & Analyze) and Step 4 (Targeted Questions) with the correct path `references/fixture-design.md`.

- [ ] **Step 2: Read the fixture design reference**

Run: Read `skills/test-design/references/fixture-design.md` from start to finish.

Verify:
- Content is self-contained — does not assume the reader has seen the SKILL.md sections.
- Examples are concrete and actionable.
- No placeholder text.

- [ ] **Step 3: Test skill discovery**

Run: `ls skills/test-design/SKILL.md skills/test-design/references/fixture-design.md`
Expected: Both files exist.

- [ ] **Step 4: Commit (if any fixes were made)**

```bash
git add skills/test-design/
git commit -m "fix(test-design): address review findings from final read-through"
```

Only commit if changes were made. If no issues were found, skip this step.

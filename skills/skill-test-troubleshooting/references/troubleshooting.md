# Troubleshooting Failing Tests

When a test case fails, the first step is always to read the transcript. Transcripts are stored at:

```
.workspace/runs/{timestamp}/results/{test-suite}.{test-case-id}.transcript.md
```

The transcript shows every turn the agent took: which tools it called, what it searched for, and what it produced. Read through it to understand what the agent actually did vs. what you expected.

## Common Failure Modes

### Skill did not activate

The most common failure. The agent receives the prompt but never invokes the skill being tested. Instead it tries to handle the task on its own, usually by exploring the codebase or writing something from scratch.

**How to spot it:** The transcript shows no `Skill` tool call for the skill under test. The agent spends turns using Bash, Glob, or Explore subagents to figure things out independently.

**Fix:** Rephrase the skill's `description` field in its SKILL.md frontmatter. Descriptions are agent-facing, not human-facing. Their purpose is to tell the AI agent exactly when to invoke the skill and in what context. A good description:

- Front-loads the trigger conditions ("Use when the user wants to...")
- Lists specific phrases and patterns the user might say
- Covers both exact matches ("write test cases") and natural variations ("write me a single test case")
- States ownership clearly ("This skill handles ALL X for Y")

A bad description reads like documentation for a human. The agent does not need to know what the skill does internally; it needs to know when to reach for it.

### Prompt too vague for single-turn testing

The agent activates the skill correctly but spends all its turns on the skill's discovery and question-asking flow, never reaching the behavior you wanted to test.

**Fix:** Add context to the prompt that lets the agent skip past discovery steps. For example, instead of "write tests for csv", say "There's a csv skill in this project but no tests yet. Write me a single test case that covers X." This tells the agent what it needs to know upfront.

### Agent explores instead of acting

The agent burns turns searching for files, reading examples, or spawning Explore subagents before doing anything useful.

**How to spot it:** The transcript is full of `find`, `ls`, Glob, or Bash calls with no meaningful output between them.

**Fix:** This is often a symptom of the skill not activating (see above). If the skill did activate but the skill itself is exploring too much, check whether the skill's instructions tell it to use specific Glob patterns rather than open-ended searches.

### Agent swallows the prompt's failure presupposition

The prompt asserts something is broken ("fix the flaky X test") when the run history shows it passing. Instead of reporting that nothing is wrong, the agent invents a plausible-sounding defect and "fixes" it, modifying files based on pure speculation.

**How to spot it:** The grading output shows the agent inspected run history that contained only passes, then pivoted to a confident diagnosis anyway ("I can see the issue now") and edited the skill or spec.

**Fix:** This is a skill-instruction gap, not a prompt or fixture problem. The skill being tested needs an explicit branch for "history exists and passes": report that the test has not been failing and stop, without modifying files. Treat the user's claim of failure as something to verify, not a premise to satisfy.

### CLI invoked from the wrong working directory

The agent calls a cwd-sensitive CLI (like `skill-unit`, which resolves `.workspace/runs/` relative to its working directory) after `cd`-ing somewhere else, typically to the directory containing a wrapper script. The CLI truthfully reports "no run history," the agent believes it, and goes down an expensive re-run or re-create path even though seeded history exists.

**How to spot it:** A Bash call of the form `cd <somewhere> && <cli> transcript latest <id>` returning "no run history," in a workspace whose fixture seeds `.workspace/runs/`. Subsequent turns show the agent re-running tests or scaffolding files the fixture already provides.

**Fix:** The skill's instructions must pin the invocation directory: run the CLI from the agent's starting working directory and never `cd` elsewhere to invoke wrappers. Reference scripts by path instead of changing directory to them. Avoid the phrase "project root" in instructions; an agent whose visible paths include a parent project may resolve "project root" to that parent instead of its own working directory.

### Test ID collides with another reachable project

The fixture defines a test whose ID also exists in a project the agent can reach (a parent repository visible in the workspace path, for instance). When the agent's lookups in the wrong location succeed, it diagnoses and "fixes" the identically-named test in the wrong project, completely bypassing the fixture.

**How to spot it:** The transcript shows lookups returning spec names or run history that do not exist in the fixture. The grading output describes the agent working on a test whose content does not match the fixture's test.

**Fix:** Rename the fixture's test ID to something unique that cannot collide with the host project's real test IDs. Fixture test IDs should never reuse well-known IDs from the project that runs the test suite.

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

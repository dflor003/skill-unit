---
name: skill-unit-troubleshooting-tests
skill: skill-unit
tags: [troubleshooting, integration]
global-fixtures: ./fixtures/seeded-runs
allowed-tools:
  - Read
  - Bash
  - Skill
---

### SU-T1: Reports the Latest Run Verdict

When a user asks whether the most recent run passed, the agent should answer by calling the read-only CLI that summarizes run state rather than poking at the workspace directly. This test locks in the invariant that run-artifact access is always mediated by the CLI.

**Prompt:**

> Hey, did the last test run actually pass?

**Expectations:**

- Response identifies the newest seeded run (2026-04-18-12-00-00) as the one being reported on
- Response communicates that two tests failed and one test passed in that run
- A skill-unit CLI subcommand was invoked via `run-cli.sh` to obtain the verdict
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly
- Did not claim the run passed

---

### SU-T2: Explains Why the Latest Run Failed

Follow-up diagnosis after a failed run is a core troubleshooting path. The agent should surface the failing test id and its failure reason from the CLI's output rather than inventing an explanation or reading transcript files by hand.

**Prompt:**

> Something went wrong with my tests last night. What broke?

**Expectations:**

- Response names WG-1 as the failing test case
- Response quotes or paraphrases the failure reason (returning 41 instead of 42)
- The skill-unit CLI was invoked with a subcommand that filters to failed tests for the latest run (for example, `show latest --failed-only`)
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly
- Did not fabricate a failure reason that is not present in the seeded run artifacts

---

### SU-T3: Summarizes a Single Test Without Dumping Its Transcript

When a user asks how a specific test went without explicitly requesting the whole transcript, the agent should answer with a short summary (verdict + failure reason) from the CLI's default output, not by fetching and dumping the full transcript. This guards against the agent blasting a full transcript into chat when a summary would do.

**Prompt:**

> How did EX-2 go last time?

**Expectations:**

- Response states that EX-2 failed
- Response includes the failure reason for EX-2 (the freeform apology at Turn 3)
- The skill-unit CLI was invoked to produce the summary
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Response does not contain the literal transcript line "I am sorry, I could not process that."
- The CLI was not invoked with a `--full` flag
- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly

---

### SU-T4: Produces the Full Transcript When Explicitly Asked

The counterpart to SU-T3: when the user explicitly asks for the entire transcript, the agent should pass through to the full-transcript mode of the CLI and return its contents. This verifies the summary-by-default rule doesn't prevent access when the user really wants everything.

**Prompt:**

> Print the entire conversation that happened in the EX-2 test, start to finish. I want to read the whole thing.

**Expectations:**

- Response contains content from the seeded EX-2 transcript, including the line "I am sorry, I could not process that."
- The skill-unit CLI was invoked with a `--full` flag (or equivalent) to request the full transcript
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly
- Did not paraphrase or truncate the transcript instead of returning its actual contents

---

### SU-T5: Lists Recent Runs in Newest-First Order

A common troubleshooting starting point is "what runs do I even have?" The agent should answer via the runs-listing subcommand, and the ordering should be newest-first so the most recent run is the easiest to act on.

**Prompt:**

> What test runs do I have lying around?

**Expectations:**

- Response lists the run dated 2026-04-18-12-00-00
- Response lists the run dated 2026-04-17-10-00-00
- The 2026-04-18-12-00-00 run appears above the 2026-04-17-10-00-00 run in the response
- The skill-unit CLI's runs-listing subcommand was invoked to produce the list
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly
- Did not invent runs that are not present in the seeded fixture

---

### SU-T6: Disambiguates Named Targets Before Troubleshooting

When the user names a target that could be a skill, a spec, or a test id, the agent should resolve what the name actually refers to before calling any troubleshooting subcommand. This prevents the agent from guessing a filter and either missing results or reporting on the wrong thing.

**Prompt:**

> How did the widget tests do last time around?

**Expectations:**

- The skill-unit CLI was invoked with `ls --search widget` (or an equivalent disambiguation subcommand) before any troubleshooting subcommand ran
- Response reports on the WG-1 result from the seeded run dated 2026-04-18-12-00-00
- All access to run artifacts went through the skill-unit CLI

**Negative Expectations:**

- Did not Read, Glob, or Grep any file under `.workspace/runs/` directly
- Did not invoke a troubleshooting subcommand with a guessed filter before resolving what "widget" refers to
- Did not report on the example-tests spec as if it were the widget tests

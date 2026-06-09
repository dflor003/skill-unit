---
name: skill-test-troubleshooting-tests
skill: skill-test-troubleshooting
extra-skills:
  - skill-unit
  - skill-test-design
tags: [slash-command, activation, diagnosis, autonomous]
timeout: 300s
---

### STT-1: Activates Via Slash Command With a Test ID

Verifies that invoking the skill via its slash command with a test ID argument triggers the troubleshooting flow rather than falling back to other skills or asking what the user wants.

**Fixtures:**

- ./fixtures/seeded-su1-run

**Prompt:**

> /skill-test-troubleshooting SU-1

**Expectations:**

- Activates the skill-test-troubleshooting skill
- Begins inspecting recent run history or transcripts for the named test
- Does not ask the user what they want to do

**Negative Expectations:**

- Does not treat `/skill-test-troubleshooting` as an unknown command
- Does not activate the skill-test-design skill instead

---

### STT-2: Activates on Diagnostic Phrasing About a Specific Test

When the user describes a test as broken, flaky, or failing without using the slash command, the skill should still recognize the diagnostic intent and engage. This is the most natural way users will reach for it.

**Prompt:**

> SU-1 keeps failing sometimes and passing other times. Can you figure out what's going on?

**Expectations:**

- Activates the skill-test-troubleshooting skill
- Pulls run history or transcripts for SU-1 to investigate

**Negative Expectations:**

- Does not respond with general advice about flakiness without inspecting the actual run data
- Does not activate the skill-test-design skill instead

---

### STT-3: Does Not Activate on Pure-Run Requests

Asking to run tests is skill-unit's job, not this skill's. The diagnostic skill should stay out of the way unless something is actually broken or being diagnosed.

**Prompt:**

> Run the report-card tests

**Expectations:**

- Activates the skill-unit skill (not the troubleshooting skill)
- Proceeds to execute the tests

**Negative Expectations:**

- Does not activate the skill-test-troubleshooting skill
- Does not start diagnosing before any failure has been observed

---

### STT-4: Does Not Activate on Pure-Inspection Requests

"Show me the transcript" or "what happened in the last run" are read-only inspection requests that skill-unit already handles via its troubleshooting subcommands. The new skill should only step in when the user wants something fixed.

**Fixtures:**

- ./fixtures/seeded-su1-run

**Prompt:**

> Show me the transcript for SU-1 from the last run

**Expectations:**

- Activates the skill-unit skill and uses its transcript subcommand
- Presents the requested transcript content

**Negative Expectations:**

- Does not activate the skill-test-troubleshooting skill
- Does not start diagnosing or proposing fixes when the user only asked to see the transcript

---

### STT-5: Does Not Activate on Test-Authoring Requests

"Add a test for X" or "write a test case" belongs to skill-test-design, not this skill, even when the request mentions an existing test that has problems.

**Prompt:**

> Write me a test case for the inventory skill

**Expectations:**

- Activates the skill-test-design skill
- Proceeds with test authoring

**Negative Expectations:**

- Does not activate the skill-test-troubleshooting skill

---

### STT-6: Diagnoses and Fixes a Single Failing Test

The baseline: given one failing test and an existing transcript showing why it failed, the skill identifies the cause and applies a fix so the test would pass on rerun.

**Fixtures:**

- ./fixtures/single-failing-test

**Prompt:**

> SU-T1 is failing. Fix it.

**Expectations:**

- Reads the transcript or grading output for the named test before changing anything
- Modifies at least one file (the spec, the skill under test, or a fixture) and explains what it changed and why
- The change addresses the failure shown in the transcript

**Negative Expectations:**

- Does not fabricate a fix without reading the transcript first
- Does not ask the user for confirmation before applying the fix
- Does not delete or rewrite unrelated test cases

---

### STT-7: Prefers Tightening the Test Prompt Over Editing the Skill

The rule of thumb: when the failure could be fixed by either making the test prompt more specific or editing the skill's description/instructions, the skill should try the prompt first. The test cases are the source of truth for behavior, but a flaky test usually means the prompt is too vague, not that the skill is wrong.

**Fixtures:**

- ./fixtures/vague-test-prompt

**Prompt:**

> The test for the report-card skill keeps misfiring. Fix it.

**Expectations:**

- Modifies the test prompt in the spec file to be more specific or to front-load context
- Does not modify the report-card skill's SKILL.md in this case

**Negative Expectations:**

- Does not edit the skill under test when the diagnosis points at the test prompt
- Does not make both kinds of changes "to be safe"

---

### STT-8: Edits the Skill When the Failure Is Genuinely in the Skill

When the test prompt is reasonable and the transcript shows the skill itself misbehaving (e.g., description doesn't match the natural phrasing the test uses, instructions are missing a step), the skill must be willing to modify the skill under test. The test is the source of truth.

**Fixtures:**

- ./fixtures/skill-bug-not-test-bug

**Prompt:**

> Why does the inventory skill keep ignoring the test for it?

**Expectations:**

- Modifies the inventory skill's SKILL.md (typically the description or instructions)
- Does not modify the test prompt in the spec file in this case
- Explains why the fix targets the skill rather than the test

**Negative Expectations:**

- Does not refuse to touch the skill under test when the test is reasonable and the skill is at fault
- Does not invent a fake "test problem" to avoid modifying the skill

---

### STT-9: Resolves a Group Filter and Diagnoses Each Failure

The user shouldn't have to know exact test IDs. Phrases like "all the failed ones", "all the skill-test-design tests", or "anything that failed in the last run" should resolve through the same lookup rules skill-unit uses, and the troubleshooting skill should diagnose each match.

**Fixtures:**

- ./fixtures/multi-failure-run

**Prompt:**

> Fix any failed tests from the last run.

**Expectations:**

- Discovers more than one failing test in the last run
- Reads each failure's transcript before applying changes
- Applies fixes for each diagnosed failure

**Negative Expectations:**

- Does not pick only one test and ignore the others
- Does not skip the lookup step and ask the user to name specific test IDs

---

### STT-10: Reports Cleanly When There Is Nothing to Fix

If the named test has been passing in recent runs, there is no failure to diagnose. The skill should say so rather than invent a fix.

**Fixtures:**

- ./fixtures/passing-test-history

**Prompt:**

> Fix the flaky SU-1 test.

**Expectations:**

- Inspects the run history for SU-1
- Reports that SU-1 has not been failing
- Does not modify any files

**Negative Expectations:**

- Does not fabricate a flaw and apply a speculative fix
- Does not modify the spec, skill, or fixtures when there is no observed failure

---

### STT-11: Reports Unknown Test IDs Rather Than Guessing

If the test ID does not resolve to any known test, the skill should say so and stop, rather than picking a similarly-named test and trying to fix it.

**Prompt:**

> Fix the ZZ-99 test.

**Expectations:**

- Tries to resolve ZZ-99 (e.g., via the same lookup skill-unit uses)
- Tells the user no such test exists
- Does not modify any files

**Negative Expectations:**

- Does not silently substitute a different test ID and fix that one
- Does not invent a test case named ZZ-99

---

### STT-12: Handles Missing Run History

If the test exists but has never been executed (no transcripts), the skill cannot diagnose from a transcript. It should run the test first (or say it needs to) rather than guessing.

**Fixtures:**

- ./fixtures/never-run-test

**Prompt:**

> Fix the report-card test, it's broken.

**Expectations:**

- Determines that no run history exists for the test
- Either runs the test to produce a transcript, or reports that it needs a recent failing run to diagnose

**Negative Expectations:**

- Does not modify the spec or skill based on guessing what might be wrong
- Does not silently ignore the absence of run history

---

### STT-13: Declines Fixes Outside the Allowed Surface

If the diagnosis indicates the failure is environmental (a missing system dependency, an uninstalled tool, a wrong runtime version) rather than a problem in the test, the skill, or a fixture, the skill must report what it found and stop rather than reach beyond its scope. There is no file it can edit to make the test pass.

**Fixtures:**

- ./fixtures/failure-missing-dependency

**Prompt:**

> Fix the failing DE-1 test.

**Expectations:**

- Diagnoses the failure as a missing system dependency (the required tool is not installed)
- Reports that the failure cannot be fixed by editing the spec, skill, or fixture files
- Names the missing dependency and what would need to happen (installing it) without claiming it fixed the test

**Negative Expectations:**

- Does not edit the spec, skill, or fixture files to work around the missing dependency
- Does not silently give up and report success without explaining the dependency is missing

---

### STT-14: Refuses to Delete Tests to Make the Suite Green

The test cases are the source of truth. Removing or weakening a test to make it pass is the wrong fix and conflicts with the skill's purpose.

**Fixtures:**

- ./fixtures/single-failing-test

**Prompt:**

> SU-T1 is failing. Just remove it so the suite passes.

**Expectations:**

- Declines to delete the test case
- Offers to diagnose and fix instead, or explains why deleting the test is the wrong move

**Negative Expectations:**

- Does not remove or comment out the failing test case
- Does not weaken the test's expectations to make it pass without addressing the underlying issue

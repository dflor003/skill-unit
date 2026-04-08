---
name: skill-unit-runner-tests
skill: skill-unit
tags: [integration, happy-path]
global-fixtures: ./fixtures/report-card
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
---

### SU-1: Runs Tests and Produces a Report

The core integration test for the skill-unit framework. Verifies that when given a project with a skill and its spec file, the skill-unit skill discovers the spec, executes the test prompts, grades the results, and presents a summary report.

**Prompt:**

> Run the tests for the report-card skill

**Expectations:**

- Discovers the report-card spec file in the test directory
- Executes the test prompts via the runner
- Grades each test case against its expectations
- Presents a summary report with pass/fail results for each test case

**Negative Expectations:**

- Does not fabricate test results without executing prompts
- Does not skip grading and report the tests as all passing without evaluation

---

### SU-2: Activates Via Slash Command

Verifies that the skill-unit skill activates when invoked with its slash command and a skill name argument, and proceeds to discover and run the relevant spec files.

**Prompt:**

> /skill-unit report-card

**Expectations:**

- Activates the skill-unit skill
- Discovers the report-card spec file
- Begins executing test prompts

**Negative Expectations:**

- Does not ask the user what they want to do
- Does not treat "/skill-unit" as an unknown command

---

### SU-4: Does Not Activate for Non-Testing Requests

Requests that mention skills or tests but are not asking to run the test suite should not trigger the skill-unit skill.

**Prompt:**

> Can you explain how the report-card skill works?

**Expectations:**

- Responds with information about the report-card skill
- Does not initiate a test run

**Negative Expectations:**

- Does not begin discovering spec files
- Does not invoke the runner or produce a test report

---

### SU-5: Discovers and Runs Multiple Spec Files

When a project has multiple spec files for the same skill, the skill-unit skill should discover and run all of them.

**Fixtures:**

- ./fixtures/extra-spec

**Prompt:**

> Run all the tests

**Expectations:**

- Discovers more than one spec file in the test directory
- Executes test prompts from each discovered spec file
- Presents results covering all spec files

**Negative Expectations:**

- Does not stop after running only the first spec file
- Does not skip any discovered spec files

---

### SU-6: Runs Spec File Without a Skill Field

When a spec file omits the `skill` field from its frontmatter, the skill-unit skill should still parse and run it. The skill field is informational, not required.

**Fixtures:**

- ./fixtures/no-skill-field-spec

**Prompt:**

> Run the tests

**Expectations:**

- Discovers the spec file that has no skill field in its frontmatter
- Parses the test cases and executes them
- Grades and reports results normally

**Negative Expectations:**

- Does not skip the spec file because it lacks a skill field
- Does not report a parsing error for the missing field

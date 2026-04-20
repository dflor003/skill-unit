---
name: test-design-tests
skill: test-design
tags: [slash-command, activation, fixtures]
global-fixtures: ./fixtures/csv-skill
---

### TD-1: Generated Test Case Follows Quality Guidelines

This verifies that when given a clear target behavior, the skill produces a test case with a natural prompt, behavioral expectations, and proper structure, not one that leaks implementation details or leads the agent.

**Prompt:**

> There's a csv skill in this project but no tests yet. Write me a single test case covering what happens when someone pastes in CSV rows without a header. Don't ask any clarifying questions, just write the test case.

**Expectations:**

- The generated prompt sounds natural and human, something a real user would say
- The generated expectations describe observable outcomes
- The generated test case includes a purpose statement explaining why the test exists
- The generated test case title is human-readable Title Case

**Negative Expectations:**

- Inside the generated test case, the **Prompt** section (the blockquote text that would be sent to the agent) does not contain skill internals like "Col1", "column indices", or the specific fallback behavior. Note: the Expectations section MAY reference these, only the Prompt must be free of them.
- Inside the generated test case, the **Prompt** section does not describe the expected output format or hint at the correct answer

---

### TD-2: Detects Existing Spec and Offers Review

When a spec file already exists for the target skill, the skill should find it and ask the user whether they want a gap review or have specific changes in mind. It should not silently create a new spec from scratch.

**Fixtures:**

- ./fixtures/csv-existing-spec

**Prompt:**

> I'd like to work on the tests for the csv skill

**Expectations:**

- Discovers the existing spec file for the csv skill
- Tells the user an existing spec was found and shows its path
- Asks whether the user wants a gap review or has specific changes

**Negative Expectations:**

- Does not start generating a new spec from scratch
- Does not skip straight to test case generation without acknowledging the existing spec

---

### TD-3: Handles Malformed Skill Gracefully

When the target skill has a SKILL.md with broken YAML frontmatter, the skill should detect the problem and inform the user rather than silently ignoring it or crashing.

**Fixtures:**

- ./fixtures/malformed-skill

**Prompt:**

> Help me write tests for the inventory skill

**Expectations:**

- Finds the inventory skill's SKILL.md
- Detects that the frontmatter is malformed or unparseable
- Informs the user about the problem with the SKILL.md file

**Negative Expectations:**

- Does not silently ignore the malformed content and generate test cases anyway
- Does not crash or produce an unhandled error

---

### TD-4: Generated Fixtures Use Neutral Names and Content

When the skill creates fixture files for an existing test case, the file names and content must not leak test intent to the agent under test. A fixture representing a boundary or failure scenario should look like plausible input, not telegraph the condition being tested.

**Fixtures:**

- ./fixtures/csv-spec-needs-fixture

**Prompt:**

> The csv spec has a test case (CSV-2) that references a fixture folder that doesn't exist yet. Create the fixture.

**Expectations:**

- Creates at least one file inside the fixture folder referenced by CSV-2
- The created file name does not contain words like "oversized", "too-many", "excess", "limit", or "cap"
- The fixture content does not include comments or text explaining what is being tested

**Negative Expectations:**

- Does not name the fixture file something like "too-many-rows.csv", "oversized.csv", or "row-cap-test.csv"
- Does not include comments in the fixture describing what is being tested or what the expected behavior is

---

### TD-5: Asks Discovery Questions for Undocumented Behavior

When the user asks for a test case covering behavior that is not specified in the target skill's SKILL.md, the skill should recognize the gap and enter the prompt-driven development flow, asking the user what the intended behavior should be rather than silently fabricating expectations.

**Prompt:**

> There's a csv skill in this project. Write me a test case for what happens when the skill receives a malformed CSV file with mismatched column counts.

**Expectations:**

- Identifies that the malformed-row behavior is not documented in the csv skill's SKILL.md
- Asks the user at least one discovery question about the intended behavior before writing any spec file
- Stops to wait for the user's answer rather than proceeding with made-up expectations

**Negative Expectations:**

- Does not silently write a spec file with invented expectations for the undocumented behavior
- Does not state that the skill "should" behave a particular way on malformed input without first asking the user

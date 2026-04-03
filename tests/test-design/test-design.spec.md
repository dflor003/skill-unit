---
name: test-design-tests
skill: test-design
tags: [slash-command, activation, fixtures]
fixtures: ./fixtures/multi-skill-project
---

### TDD-1: slash-command-activation

**Prompt:**
> /test-design

**Expectations:**
- Scans for available skills in the project
- Presents a list of discovered skills or asks which skill to test

**Negative Expectations:**
- Does not begin generating test cases without identifying a target skill first

---

### TDD-2: natural-language-activation

**Prompt:**
> I want to write some test cases for my skill

**Expectations:**
- Recognizes this as a test-design request
- Scans for available skills or asks the user to identify the target skill

**Negative Expectations:**
- Does not start writing code or implementation instead of test cases
- Does not ask what kind of tests (unit, integration, etc.) — this skill only writes spec files

---

### TDD-3: negative-activation-similar-request

**Prompt:**
> where are my test results stored?

**Expectations:**
- Responds with information about test result file locations or the results directory
- Does not initiate a test-design workflow

**Negative Expectations:**
- Does not ask the user to select a skill for test design
- Does not begin generating test cases

---

### TDD-4: selects-skill-from-list

**Prompt:**
> help me design some tests for alpha

**Expectations:**
- Discovers available skills in the project
- Selects the alpha skill based on the name provided
- Reads the alpha skill's SKILL.md
- Presents a summary of the skill's purpose, activation, inputs, and outputs
- Asks targeted questions before generating test cases

**Negative Expectations:**
- Does not skip directly to generating test cases without analyzing the skill first

---

### TDD-5: generates-test-cases-incrementally

**Prompt:**
> /test-design alpha

**Expectations:**
- Reads the alpha skill's SKILL.md
- Generates test cases organized by category (activation, happy path, failure mode, etc.)
- Presents one category at a time and asks for feedback before moving to the next
- Generated prompts sound natural and human — no skill names or tool names in prompts

**Negative Expectations:**
- Does not dump all test cases at once without pausing for feedback
- Does not include skill or tool names in generated test prompts

---

### TDD-6: writes-spec-file-to-disk

**Prompt:**
> /test-design alpha

**Expectations:**
- After all categories are approved, assembles a complete spec file with YAML frontmatter
- Writes the file to the test directory using the correct path convention
- Confirms the file location and test case count to the user

**Negative Expectations:**
- Does not write the spec file before the user has approved all categories

---

### TDD-8: skill-name-no-match-close-alternative

**Prompt:**
> write tests for the alfa skill

**Expectations:**
- Searches for a skill matching "alfa"
- Detects that no exact match exists but a close match ("alpha") is available
- Asks the user if they meant "alpha"

**Negative Expectations:**
- Does not silently pick the closest match without confirming
- Does not immediately enter TDD mode without checking for similar names first

---

### TDD-9: skill-name-no-match-no-alternative

**Prompt:**
> design tests for the zephyr skill

**Expectations:**
- Searches for a skill matching "zephyr"
- Informs the user no skill with that name was found
- Asks if the user wants to design tests for the skill without an existing SKILL.md (TDD mode)

**Negative Expectations:**
- Does not fabricate a skill description
- Does not silently proceed as if the skill exists

---

### TDD-11: existing-spec-detected-gap-review

**Prompt:**
> can you review the tests I already have for alpha?

**Expectations:**
- Discovers the existing spec file for the alpha skill
- Reads the spec file and compares coverage against the category checklist
- Presents findings as a prioritized list of gaps or quality issues
- Offers to work through improvements one at a time

**Negative Expectations:**
- Does not create a new spec file from scratch when one already exists
- Does not overwrite the existing spec without user approval

---

### TDD-12: existing-spec-user-directed-edit

**Prompt:**
> add a failure mode test to my alpha spec

**Expectations:**
- Finds the existing spec file for the alpha skill
- Detects the existing ID prefix and next sequential number
- Generates a new failure mode test case and presents it for approval
- Writes the updated spec file only after approval

**Negative Expectations:**
- Does not regenerate the entire spec from scratch
- Does not renumber existing test cases

---

### TDD-13: asked-to-run-tests-not-design

**Prompt:**
> can you execute the test suite for alpha and tell me what passed?

**Expectations:**
- Recognizes this as a test execution request, not test design
- Does not enter the test-design workflow
- Directs the user toward running tests instead

**Negative Expectations:**
- Does not begin asking targeted questions about the skill
- Does not generate test cases

---

### TDD-14: asked-to-write-skill-not-tests

**Prompt:**
> I need a new skill that validates YAML files

**Expectations:**
- Recognizes this as a skill creation request, not test design
- Does not enter the test-design workflow

**Negative Expectations:**
- Does not begin scanning for skills to test
- Does not start generating spec file frontmatter

---

### TDD-15: asks-one-question-at-a-time

**Prompt:**
> /test-design alpha

**Expectations:**
- After analyzing the skill, asks a single targeted question and waits for a response
- Does not present multiple questions in the same message

**Negative Expectations:**
- Does not present a numbered list of questions all at once
- Does not skip targeted questions entirely and jump to test generation

---

### TDD-16: respects-approval-gates

**Prompt:**
> /test-design alpha

**Expectations:**
- Presents the frontmatter for approval before generating test cases
- Presents each test category and asks for feedback before moving to the next
- Offers options to refine, add, remove, or approve at each step

**Negative Expectations:**
- Does not generate all categories in a single response without pausing
- Does not write the spec file without explicit approval

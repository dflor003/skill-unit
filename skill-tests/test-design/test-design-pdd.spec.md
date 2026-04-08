---
name: test-design-pdd
skill: test-design
tags: [slash-command, prompt-driven-development]
---

### PDD-1: Recognizes Nonexistent Skill and Enters Prompt-Driven Development

When a user asks to write tests for a skill that doesn't exist in the project, the skill should explicitly tell the user the skill wasn't found and offer to define its behavior through test cases first.

**Prompt:**

> I'd like to write some tests for my notifications skill

**Expectations:**

- Informs the user that no skill named "notifications" was found
- Offers to define the skill's behavior by writing test cases first
- Asks a discovery question about what the skill should do

**Negative Expectations:**

- Does not fabricate a skill description or pretend the skill exists
- Does not silently proceed to generate test cases without acknowledging the skill is missing

---

### PDD-2: Detects Capability Mismatch on Existing Skill

When a user asks to write tests for an existing skill but describes behavior that isn't in the skill's definition, the skill should catch the mismatch and enter prompt-driven development for the new capability rather than silently generating tests as if the feature exists.

**Fixtures:**

- ./fixtures/csv-skill

**Prompt:**

> Write a test case for the csv skill covering its ability to export tables as PDF

**Expectations:**

- Reads the csv skill and recognizes that PDF export is not a documented capability
- Tells the user the csv skill does not currently have PDF export functionality
- Offers to define the new behavior through test cases first

**Negative Expectations:**

- Does not generate a test case that assumes PDF export already works
- Does not silently proceed as if the feature exists

---

<!-- TODO: Expand into a multi-turn test when interactive sessions are supported.
     Verify the skill generates a test case after the user answers the remaining
     discovery question, rather than only testing the first response. -->

### PDD-3: Does Not Re-Ask Questions the User Already Answered

When a user provides context about their skill upfront, the skill should not ask discovery questions whose answers are already in the prompt. It may ask about genuinely missing details, but should not repeat what the user already said.

**Prompt:**

> I'm building a skill that validates YAML files when users say things like "check this YAML" or "validate my config." It reports syntax errors with line numbers. Write me a test case for when the input has invalid syntax.

**Expectations:**

- Recognizes the skill doesn't exist and enters prompt-driven development
- Acknowledges the details the user already provided

**Negative Expectations:**

- Does not ask "what should this skill do" when the user already explained it
- Does not ask how the skill should be invoked when the user already gave example phrases
- Does not ask what outputs the skill produces when the user already said "reports syntax errors with line numbers"

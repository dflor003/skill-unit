---
name: test-design-tdd-mode
skill: test-design
tags: [slash-command, tdd]
fixtures: ./fixtures/empty-project
---

### TDD-7: no-skills-found-tdd-mode

**Prompt:**
> I'd like to design tests for a new skill I'm building

**Expectations:**
- Detects that no skills exist in the project
- Asks the user for the skill name
- Asks for high-level requirements or a description of what the skill should do
- Infers test cases from the provided requirements

**Negative Expectations:**
- Does not report an error and stop
- Does not require an existing SKILL.md to proceed

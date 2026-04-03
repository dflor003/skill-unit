---
name: test-design
description: This skill should be used when the user asks to "design tests", "write test cases", "create a spec file", "help me write tests for my skill", "add tests for a skill", "/test-design", or mentions test case design, spec file authoring, or test coverage for a skill. It guides incremental creation and refinement of *.spec.md test files for the skill-unit framework.
---

# Test Design — Spec File Authoring Skill

Design, write, and refine `*.spec.md` test files for AI agent skills. This skill reads a target skill's SKILL.md, asks targeted questions about gaps it cannot infer, and incrementally generates test cases by category with refinement loops after each.

## Invocation

- **Slash command:** `/test-design`, `/test-design <skill-name>`
- **Natural language:** "design tests for my skill", "write test cases for the commit skill", "help me write a spec file", "add tests for brainstorming"

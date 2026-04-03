---
name: test-design-malformed-skill
skill: test-design
tags: [slash-command, fixtures]
fixtures: ./fixtures/malformed-skill
---

### TDD-10: malformed-skill-md

**Prompt:**
> /test-design broken

**Expectations:**
- Reads the broken skill's SKILL.md
- Detects that the content is malformed or unparseable
- Informs the user about the problem with the SKILL.md file

**Negative Expectations:**
- Does not silently ignore the malformed content and generate test cases anyway
- Does not crash or produce an unhandled error

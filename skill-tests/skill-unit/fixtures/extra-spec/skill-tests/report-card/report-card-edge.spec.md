---
name: report-card-edge-tests
skill: report-card
tags: [failure-mode]
global-fixtures: ./fixtures/basic-class
---

### RC-2: No Student Data File Present

Verifies the skill handles a missing students.json gracefully.

**Prompt:**

> Show me the grades

**Expectations:**

- Informs the user that no student data was found

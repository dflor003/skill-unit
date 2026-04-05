---
name: skill-unit-empty-project
skill: skill-unit
tags: [failure-mode]
---

### SU-3: Informs User When No Spec Files Are Found

When the project has no spec files, the skill should tell the user rather than silently doing nothing or producing an empty report.

**Prompt:**
> Run the skill tests

**Expectations:**
- Searches for spec files in the test directory
- Informs the user that no spec files were found

**Negative Expectations:**
- Does not produce an empty report as if tests ran successfully
- Does not fabricate test results

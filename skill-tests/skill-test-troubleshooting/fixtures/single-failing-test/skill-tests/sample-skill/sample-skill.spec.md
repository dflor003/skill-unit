---
name: sample-skill-tests
skill: sample-skill
tags: [demo, failing]
---

### SU-T1: Processes a List Without Clear Parameters

Asks the sample-skill to summarize some data, but the prompt is vague about what kind of summary is expected.

**Prompt:**

> Do something with the items

**Expectations:**

- Output is formatted clearly
- Contains all items
- Shows a count of items

**Negative Expectations:**

- Does not modify any files
- Does not produce an error

---

### SU-T2: Works with Explicit Instructions

When given clear instructions, the skill produces the expected output consistently.

**Prompt:**

> Create a numbered list summary of these items: apple, banana, cherry. Include a total count at the end.

**Expectations:**

- Output is a numbered list
- All three items are included
- Total count is shown at the end

**Negative Expectations:**

- Does not modify any files

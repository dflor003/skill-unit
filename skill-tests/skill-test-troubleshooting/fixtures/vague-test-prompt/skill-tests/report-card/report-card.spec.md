---
name: report-card-tests
skill: report-card
tags: [happy-path]
---

### RC-1: Produces a Student Summary

Verifies that the skill activates on a parent's question about their child's school progress and produces a one-paragraph summary.

**Prompt:**

> tell me

**Expectations:**

- Activates the report-card skill
- Produces a one-paragraph summary

**Negative Expectations:**

- Does not respond with a clarifying question
- Does not output a long table or multiple paragraphs

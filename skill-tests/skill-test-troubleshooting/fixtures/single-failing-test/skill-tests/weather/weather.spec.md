---
name: weather-tests
skill: weather
tags: [happy-path]
---

### SU-T1: Answers a Weather Question

Verifies that when the user asks about weather conditions, the skill activates and produces a one-line summary.

**Prompt:**

> what's the weather

**Expectations:**

- Activates the weather skill
- Responds with a one-line summary in the documented format

**Negative Expectations:**

- Does not produce a long explanation or follow-up questions
- Does not say it cannot answer

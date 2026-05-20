---
name: timer-tests
skill: timer
tags: [happy-path]
---

### SU-1: Starts a Timer

The skill should activate on a natural timer-start request.

**Prompt:**

> start a timer

**Expectations:**

- Activates the timer skill
- Responds with `Timer: {seconds}s`

**Negative Expectations:**

- Does not ask the user for clarification

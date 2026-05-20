---
name: widget-tests
skill: widget
tags: [happy-path]
---

### WG-1: Totals a Small Widget Order

The skill should activate on a natural total-cost question and return the documented one-line format.

**Prompt:**

> please

**Expectations:**

- Activates the widget skill
- Responds with `Total: ${amount}`

**Negative Expectations:**

- Does not ask the user for clarification

---

### WG-2: Totals a Larger Widget Order

A second total-cost question with explicit count. Same activation expectation.

**Prompt:**

> compute it

**Expectations:**

- Activates the widget skill
- Responds with `Total: ${amount}`

**Negative Expectations:**

- Does not ask the user for clarification

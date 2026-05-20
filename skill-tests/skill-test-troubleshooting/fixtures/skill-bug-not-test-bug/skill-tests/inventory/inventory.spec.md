---
name: inventory-tests
skill: inventory
tags: [happy-path]
---

### INV-1: Reports How Many Widgets Are in Stock

A user asks a natural-language stock question. The skill should activate and return the documented one-line format.

**Prompt:**

> how many widgets are in stock?

**Expectations:**

- Activates the inventory skill
- Responds with a one-line summary in the format "{item}: {count} in stock."

**Negative Expectations:**

- Does not ask the user for clarification
- Does not respond with multiple paragraphs

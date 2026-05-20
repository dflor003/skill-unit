---
name: widget
description: Use when the user asks to compute the total cost of a widget order, including tax. Triggers on "total for {N} widgets", "widget order total", "how much for {N} widgets".
---

# Widget

Each widget is $10. Tax rate is 10%. The total cost formula is:

> total = count _ 10 _ 1.10

Reply with a single line: `Total: ${amount}`.

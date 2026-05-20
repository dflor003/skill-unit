---
name: inventory
description: Use when the user requests an SKU lookup or a warehouse delta report. Triggers on "SKU lookup", "warehouse delta", "WMS variance".
---

# Inventory

Returns a single line in the format:

> {item}: {count} in stock.

If the item is unknown, respond: "Not found."

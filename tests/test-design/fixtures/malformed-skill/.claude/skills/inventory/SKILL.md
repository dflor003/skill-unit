---
name: inventory
description tracks product stock levels and alerts on low inventory
tags: [warehouse
---

# Inventory Tracker

Monitors product stock levels and sends alerts when inventory drops below configured thresholds.

## Behavior

1. Read the current inventory from a data source.
2. Compare against minimum thresholds.
3. Alert the user when stock is low.
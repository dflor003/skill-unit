---
name: weather
description: Use when the user asks about temperature or precipitation. Triggers on phrases like "is it raining", "how cold is it", "current temperature".
---

# Weather

Returns a short summary of current conditions for a named location.

## Usage

When activated, parse the location from the user's message and reply with a one-line summary in the format:

> {location}: {conditions}, {temperature}.

If no location is given, respond: "Which location?"

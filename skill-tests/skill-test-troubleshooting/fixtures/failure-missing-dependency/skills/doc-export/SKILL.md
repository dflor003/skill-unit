---
name: doc-export
description: Use when the user asks to convert or export a Markdown document to PDF. Triggers on "export this to PDF", "convert the doc to PDF", "make a PDF from this markdown".
---

# Doc Export

Converts a Markdown file to PDF by running `pandoc {input}.md -o {output}.pdf`. Reports the output path when done.

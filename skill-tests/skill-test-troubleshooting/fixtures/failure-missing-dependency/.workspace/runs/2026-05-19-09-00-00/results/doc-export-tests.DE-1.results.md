# DE-1: Exports Markdown to PDF — FAIL

- ✓ Activates the doc-export skill
- ✗ Reports the path to a generated PDF

Reason: the skill activated and ran the documented command, but `pandoc` is not installed on this system (`command not found`, exit code 127). The spec and the skill are both correct; the failure is a missing system dependency.

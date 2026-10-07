---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the local guidelines file below (do not fetch from the network)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the local guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Use the pinned local copy in this skill folder:

```
.claude/skills/web-design-guidelines/regras.md
```

It is a fixed copy of `vercel-labs/web-interface-guidelines` `command.md` at commit
`4ecfb9fb8d1d3b7009674869b3aaee2f904042e1` (2026-10-05), copied on 2026-10-07. The header
of `regras.md` records the source. Do not fetch the `main` branch during a review; updating
the copy is a manual, reviewed step (see the project CLAUDE.md).

## Usage

When a user provides a file or pattern argument:
1. Read `regras.md` from this folder
2. Read the specified files
3. Apply all rules from the local guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

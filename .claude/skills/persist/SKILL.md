---
name: persist
description: Saves the current plan to plans/ with a descriptive name. Use after plan approval or before compaction.
---

# Persist

Copy the most recent file from `~/.claude/plans/` to `<cwd>/plans/YYYY-MM-DD-<slug>.md`. Derive the slug from the first heading (kebab-case, max 50 chars). Create the directory if needed. Report the path. Stop.

---
name: git-ship
description: >-
  Ships working changes: stage, commit, create PR via gh. Accepts --merge
  to squash-merge after PR creation, and --dry-run to preview without
  executing.
---

# /git-ship

Stage → commit → PR in one invocation. All remote operations use `gh`.

## Flags

| Flag | Effect |
|------|--------|
| `--merge` | Squash-merge the PR and delete the branch after creation |
| `--dry-run` | Show the plan without executing |

## Workflow

### 1. Preflight (parallel)

Run simultaneously:
- `git status`
- `git diff --stat` (staged + unstaged)
- `git log --oneline -5`
- `git branch -a`
- `git rev-parse --abbrev-ref HEAD`
- Detect default branch (`main` or `master`)
- `gh pr view --json state 2>/dev/null`

**Gate:** if current branch already has an open PR, stop. Report:
"Branch already has an open PR. Create a fresh branch for new changes."

**Gate:** if on main/master, stop. "Cannot ship directly to main.
Create a feature branch first."

### 2. Group and filter changes

- **One coherent group:** proceed
- **Mixed concerns:** identify primary group, report the rest:
  "Skipping unrelated changes: [file list]"
- **Ambiguous:** ask which changes to ship

Never stage `.env`, credentials, or secrets files.

### 3. Choose branch

```
On feature branch + changes fit       → stay
On feature branch + changes don't fit → find or create matching branch
```

**Finding a match:** scan local and remote branch names. Confirm with
user before switching.

**Creating:** generate a descriptive slug (e.g., `fix-auth-redirect`).
Confirm name with user. `git checkout -b <slug>`.

### 4. Commit

- `git add <file1> <file2> ...` — name each file explicitly
- Generate a concise commit message (1-2 lines) matching repo's recent
  style from step 1
- Append `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
- Show the message, then commit immediately — do not wait for approval

### 5. Push + PR

Use `AskUserQuestion`. Set the question text to:

    Push this branch in another terminal:\n\ngit push -u origin <branch>

Options: **Proceed** / **Abort**. On abort, stop.

After confirmation: `gh pr create` — inferred title from branch name
and commits, brief body summarizing changes. Report URL.

### 6. Merge (--merge flag only)

- `gh pr merge --squash --delete-branch`
- If merge fails (checks pending, review required): report status, stop
- After merge: `git checkout <default-branch>`. Print pull command in a
  fenced code block and prompt with `AskUserQuestion` to sync locally.

## Constraints

- `git add`: explicit file names only — never `-A`, `.`, `--all`
- `git commit`: stage first — never `-a` / `--all`
- All remote operations via `gh` — never `git push`, `git fetch`, `git pull`
- Never merge without `--merge` flag

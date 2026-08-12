---
name: git-ship
description: >-
  Ships working changes: stage, commit, create PR via gh. Accepts --merge
  to squash-merge after PR creation, and --dry-run to preview without
  executing.
---

# /git-ship

Stage → commit → push → PR in one invocation.

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

Use `AskUserQuestion`: "Ready to push and open PR for `<branch>`."
Options: **Push** / **Abort**. On abort, stop.

After confirmation:
- `git push -u origin <branch>`
- `bun /Users/rhhart/Documents/GitHub/weft/scripts/ghx.ts create <owner/repo> <branch> <default-branch> "<title>" "<body>"`
  — inferred title from branch name and commits, brief body summarizing
  changes. Report the returned URL.
  (`gh pr create` is a fallback only — the sandbox's keychain deny rule
  breaks Go's TLS verification for `gh`'s API calls; see
  `.claude/references/ghx-shim.md` for the root cause.)

### 6. Merge (--merge flag only)

- `bun /Users/rhhart/Documents/GitHub/weft/scripts/ghx.ts merge <owner/repo> <pr#> --squash --delete-branch`
- If merge fails (checks pending, review required): report status, stop
- After merge: `git checkout <default-branch> && git pull origin <default-branch>`

## Constraints

- `git add`: explicit file names only — never `-A`, `.`, `--all`
- `git commit`: stage first — never `-a` / `--all`
- `git push`: only to `origin` — never to other remotes
- No force-push
- Never merge without `--merge` flag

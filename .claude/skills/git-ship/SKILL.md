---
name: git-ship
description: >-
  Ships working changes through the full git workflow: stage, commit, push,
  and PR. Invoked only via the /git-ship slash command — never from general
  conversation about git, shipping, or deployment. Accepts --merge to
  squash-merge after PR creation, and --dry-run to preview without executing.
---

# /git-ship

Stage → commit → push → PR in one invocation.

**Trigger:** Only the literal `/git-ship` command. Not invoked by other
mentions of shipping, committing, or git workflows in conversation.

## Flags

| Flag | Effect |
|------|--------|
| `--merge` | Squash-merge the PR and delete the branch after creation |
| `--dry-run` | Show the plan without executing |

## Workflow

### 1. Read state (parallel)

Run these simultaneously:
- `git status`
- `git diff --stat` (staged + unstaged)
- `git log --oneline -5` (commit message style)
- `git branch -a` (local + remote branches)
- `git rev-parse --abbrev-ref HEAD` (current branch)
- Detect the repo's default branch (`main` or `master`)

### 2. Group and filter changes

Classify changed/untracked files by purpose using paths and diff content.

- **One coherent group:** proceed with all changes
- **Mixed concerns:** identify the primary group, report the rest:
  "Skipping unrelated changes: [file list]"
- **Ambiguous grouping:** ask the user which changes to ship

Never stage `.env`, credentials, or secrets files.

### 3. Choose branch

```
On feature branch + changes fit it     → stay
On feature branch + changes don't fit  → find or create a matching branch
On main/master + trivial (single file, → offer: "Push directly to main,
  docs, config, typo)                    or create a branch?"
On main/master + non-trivial           → find or create a matching branch
```

**Finding a matching branch:** scan local and remote branch names for
relevance to the changes. If a plausible match exists, confirm with the
user before switching.

**Creating a branch:** generate a descriptive slug (e.g.,
`fix-auth-redirect`, `add-session-digest`). Confirm the name with the
user before creating. Use `git checkout -b <slug>`.

### 4. Commit

- Stage only the grouped files from step 2
- Generate a concise commit message (1-2 lines) matching the repo's
  recent commit style from step 1
- Append `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
- Show the message, then commit immediately — do not wait for approval

### 5. Push

- New branch: `git push -u origin <branch>`
- Existing tracked branch: `git push`
- On failure: report the error and stop

### 6. PR

- Check for existing PR: `gh pr view --json state 2>/dev/null`
- **PR exists and open:** push already updated it. Report the PR URL.
- **No PR exists:** create one with `gh pr create` — inferred title from
  branch name and commits, brief body summarizing changes. Report URL.
- **Direct-to-main path** (trivial change from step 3): skip PR entirely.

### 7. Merge (--merge flag only)

- `gh pr merge --squash --delete-branch`
- If merge fails (checks pending, review required): report status and stop
- After successful merge: `git checkout <default-branch> && git pull`

## Boundaries

- Never force push
- Never amend existing commits
- Never include unrelated changes — report them and move on
- Never activate outside the `/git-ship` slash command
- Never merge without the explicit `--merge` flag
- Never commit `.env`, credentials, or secret files

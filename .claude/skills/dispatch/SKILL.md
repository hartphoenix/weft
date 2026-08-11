---
name: dispatch
description: >-
  Deploy a builder Claude instance into a separate cmux workspace.
  Sets dispatch env vars, starts Claude with the task prompt as its
  first turn, returns the workspace ID. MetaClaude's orchestration
  primitive.
---

# /dispatch

Launch a builder Claude Code instance in an isolated cmux workspace.

## Input

- **task** (required): Task prompt. Either a complete prompt with
  `## Task` / `## Milestone` headers, or a plain description to wrap
  in the template.
- **project** (optional): Absolute path to target project. Default:
  current working directory.
- **workspace-name** (optional): Name for the workspace. Default:
  slug from task description (3-4 words, kebab-case).

Parse from natural language — don't prompt for structured input.

## Process

### 1. Derive parameters

- **project-path:** Explicit arg or CWD. Verify the path exists.
- **metaclaude-project:** The roger project root. Use
  `/Users/rhhart/Documents/GitHub/roger` (same path exported as
  `METACLAUDE_PROJECT` for builders).
- **task-slug:** Explicit name or derived from task: lowercase,
  3-4 meaningful words, kebab-case, max 30 chars.
- **task-prompt:** If the user provided a raw description (no
  `## Task` / `## Milestone` headers), wrap it in the task template
  (step 4). If they provided a full template, use as-is.

### 2. Write prompt file

Write the task prompt to:

    <metaclaude-project>/notepad/active-sessions/dispatch-<task-slug>.prompt

This co-locates prompt files with status report digests. The
`.prompt` extension keeps them distinct from `.json` digests — hooks
and reader scripts ignore them. Orphaned prompts (from failed
dispatches) are visible in the same directory and can be swept by
the cleanup hook or deleted manually.

Do NOT use `$TMPDIR`. The sandbox may resolve it to a different
path than cmux terminal sessions.

### 3. Create workspace and launch

Run the entire setup as a **single compound command**:

```bash
PROMPT_FILE="/Users/rhhart/Documents/GitHub/roger/notepad/active-sessions/dispatch-<task-slug>.prompt" && \
WORKSPACE=$(cmux new-workspace --cwd "<project-path>" 2>&1 \
  | grep -o 'workspace:[0-9]*') && \
SURFACE=$(cmux list-pane-surfaces --workspace "$WORKSPACE" 2>&1 \
  | grep -o 'surface:[0-9]*' | head -1) && \
cmux rename-workspace --workspace "$WORKSPACE" "<task-slug>" && \
cmux send --workspace "$WORKSPACE" --surface "$SURFACE" \
  "export METACLAUDE_DISPATCH=1 METACLAUDE_PROJECT=<metaclaude-project> METACLAUDE_WORKSPACE=${CMUX_WORKSPACE_ID} METACLAUDE_SURFACE=${CMUX_SURFACE_ID}" && \
cmux send-key --workspace "$WORKSPACE" --surface "$SURFACE" enter && \
cmux send --workspace "$WORKSPACE" --surface "$SURFACE" \
  "ccode \"\$(cat $PROMPT_FILE; rm $PROMPT_FILE)\"" && \
cmux send-key --workspace "$WORKSPACE" --surface "$SURFACE" enter
```

Substitute `<project-path>`, `<task-slug>`, and
`<metaclaude-project>` with actual values. `${CMUX_WORKSPACE_ID}`
resolves to MetaClaude's own workspace at runtime — the builder
uses it to route notifications back.

**Why a single compound command:** Claude Code cancels ALL parallel
tool calls if any single one errors. Chaining each workspace's
full setup into one `&&` chain means parallel dispatches are
independent — one workspace's failure doesn't kill the others.

**Why both `--workspace` and `--surface`:** Two things to know
about cmux's resolution:
- `--workspace` alone resolves through: workspace → focused pane →
  selected surface. If a browser pane has focus, it targets the
  browser and fails with "Surface is not a terminal."
- `--surface` alone uses `$CMUX_WORKSPACE_ID` as the workspace
  context. Since MetaClaude's workspace is not the target, surface
  lookup fails with the same error.
Both flags together bypass all resolution — direct workspace + direct
surface.

**Self-cleaning prompt file:** `$(cat file; rm file)` reads the
contents (captured by `$()`), then deletes the file (no stdout).
The prompt reaches `ccode` intact; the file is gone. If the
compound command fails before reaching this step, the `.prompt`
file remains in `active-sessions/` as a visible orphan.

Stop and report if the compound command fails. Include which step
failed (workspace creation, surface discovery, rename, or launch).

### 4. Task template

When wrapping a raw description:

```
## Task
<1-2 sentence objective>

## Context
- Thread: <name> (read threads/<name>/_thread.md)
- Key files: <paths>
- Design decisions: <constraints>

## Milestone
<specific deliverable — when reached, write status report>

## Completion condition
<how to know the task is done>

## Reporting
When you reach the milestone, are blocked, or the task scope changes:
run /status-report. It writes a digest and delivers it directly to
MetaClaude's terminal via cmux send.

If Hart gives you instructions that change the scope, report the
new scope with status "redirected".

Do NOT report on intermediate turns.
```

### 5. Confirm

After the compound command succeeds, run `cmux tree --all` to capture
the current workspace inventory. Then report:

```
Builder dispatched: <workspace-name>
  Workspace: <workspace-id>
  Surface: <surface-id>
  Project: <project-path>
  Task: <first 80 chars of summary>

Active workspaces:
<cmux tree --all output>
```

The workspace snapshot keeps MetaClaude's awareness of all running
builders current. This is the primary mechanism for workspace state
tracking — do not skip it.

## Parallel dispatch

When dispatching multiple builders:

1. **Write ALL prompt files first** (step 2 for each builder).
   The Write tool is synchronous — interleaving writes and launches
   serializes everything.

2. **Launch each workspace as a separate Bash tool call** (step 3).
   Multiple Bash calls in one response run in parallel. Each is a
   self-contained compound command. If workspace:3 fails, workspace:4
   still launches.

## Browser pane conflicts

New workspaces have one terminal pane — no browser. Browser panes
appear only after Claude Code starts (session-start hooks, Claude
opening a preview, etc.). The dispatch flow completes before that,
so browser conflicts shouldn't affect initial launch.

If a **monitoring** command later fails with "Surface is not a
terminal":

1. Find the browser surface:
   `cmux list-pane-surfaces --workspace <id>`
2. Close it:
   `cmux close-surface --surface <browser-surface-id>`
3. Retry with both `--workspace <id> --surface <terminal-surface-id>`.

## Monitoring dispatched builders

Four channels in preference order:

1. **Wait for delivery** — /status-report sends digest directly to
   MetaClaude's terminal via cmux send. Stop hook is a backup that
   fires on session end.
2. **Read screen** —
   `cmux read-screen --workspace <workspace-id> --surface <surface-id> --lines 30`
3. **Request status** —
   `cmux send --workspace <workspace-id> --surface <surface-id> "/status-report"` then
   `cmux send-key --workspace <workspace-id> --surface <surface-id> enter` (only when idle)
4. **Read digests** —
   `bun /Users/rhhart/Documents/GitHub/roger/scripts/read-digests.ts`
   or `--workspace <id>` for one builder.

Always use `--surface` for monitoring commands, not `--workspace`.

## What this skill does NOT do

- Run in the builder workspace — orchestrates from MetaClaude's.
- Wait for the builder to finish — dispatches and returns.
- Modify the target project — the builder does that.

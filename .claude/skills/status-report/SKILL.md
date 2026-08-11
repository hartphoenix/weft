---
name: status-report
description: >-
  Write a structured status digest for cross-instance consumption.
  Use at milestones, when blocked, or when scope changes.
---

Write a JSON digest to the MetaClaude notepad.

## Steps

### 1. Determine paths

- If `$METACLAUDE_PROJECT` env var is set, use it as the base path
- Otherwise use `/Users/rhhart/Documents/GitHub/roger`
- Digest goes to: `<base>/notepad/active-sessions/${CMUX_WORKSPACE_ID}.json`
- If `$CMUX_WORKSPACE_ID` is not set, ask the user for the workspace ID

### 2. Collect context

Gather from your current session state (no extra tool calls needed):

- **thread:** which roger thread are you working on? (null if none)
- **status:** one of `complete`, `blocked`, `redirected`, `working`
- **summary:** 1-2 sentences, under 200 characters
- **blocked_on:** what you need to proceed (null if not blocked)
- **decisions:** list of key choices made this session
- **files_changed:** files created or modified (project-relative paths)
- **scope_note:** if status is `redirected`, describe what changed

### 3. Write the digest

Write valid JSON to the path from step 1:

```json
{
  "schema_version": 1,
  "workspace_id": "$CMUX_WORKSPACE_ID",
  "surface_id": "$CMUX_SURFACE_ID",
  "session_id": null,
  "project": "<your working directory>",
  "thread": "<thread name or null>",
  "timestamp": "<ISO 8601 now>",
  "status": "<status>",
  "summary": "<summary>",
  "blocked_on": "<description or null>",
  "decisions": [],
  "files_changed": [],
  "scope_note": "<description or null>"
}
```

### 4. Deliver to MetaClaude

The audience is another Claude instance running in a terminal, not a
human reading desktop notifications. `cmux notify` alone does NOT
reach MetaClaude — it must be a `cmux send` to MetaClaude's terminal
surface.

**Find MetaClaude's workspace and surface:**

1. If `$METACLAUDE_WORKSPACE` is set, use it.
   Otherwise, MetaClaude is typically in workspace:1 — verify with
   `cmux tree --all` and look for the workspace running the
   orchestrator session.
2. If `$METACLAUDE_SURFACE` is set, use it.
   Otherwise, discover the terminal surface:
   `cmux list-pane-surfaces --workspace <metaclaude-workspace>`
   Pick the terminal surface (not browser).

**Send the signal:**

```bash
cmux send --workspace <ws> --surface <surface> \
  "[BUILDER DIGEST] ${CMUX_WORKSPACE_ID} [<status>] — <first 80 chars of summary>. Digest: <digest-path>"
cmux send-key --workspace <ws> --surface <surface> enter
```

Both `--workspace` and `--surface` are required for cross-workspace
routing. `--workspace` alone fails if a browser pane has focus.

**Then confirm to the user:**

"Status report written and delivered to MetaClaude. [status] — [summary]"

If delivery fails (cmux error, MetaClaude workspace not found), still
write the digest file and tell the user: "Digest written to <path> but
delivery to MetaClaude failed: <reason>."

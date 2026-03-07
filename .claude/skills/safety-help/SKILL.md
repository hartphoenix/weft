---
name: safety-help
description: >
  Audits Claude Code security configuration against the Safer YOLO
  guide. Checks sandbox, deny rules, hooks, DCG, and gitleaks.
  Surfaces findings in plain language with customized recommendations.
  Use when the user mentions YOLO mode, bypass permissions, skipping
  permissions, "dangerously-skip-permissions", security setup, or
  wants to harden their configuration.
---

# Safety Help

Audit the user's security configuration. Report findings. Never
auto-apply changes.

## Entry point

| How activated | Behavior |
|---------------|----------|
| User invokes `/safety-help` | Proceed directly to Phase 0. |
| Claude suggests based on conversational cues | **Offer only.** Describe what the audit does in one sentence and ask if they'd like to run it. Do not begin Phase 0 until the user accepts. |

## Source of truth

**Priority for security-substantive content:**
1. **Gist** (fetched at runtime) — most current
2. **Local guide** (`guides/safer-yolo-mode.md`) — may lag the gist
3. **This skill** — delivery mechanism; never overrides 1 or 2

If gist and local guide conflict, follow the gist and tell the user
their local copy is behind.

## Path resolution

Read `~/.config/weft/root` for the harness root. If missing, use cwd.
- Guide: `<harness-root>/guides/safer-yolo-mode.md`
- Gist: `https://gist.github.com/hartphoenix/698eb8ef8b08ad2ce6a99cf7346cd7cc`

## Phase 0: Orient

**Ask before auditing.** Claude cannot detect its own execution
context.

> Where do you usually run Claude Code — terminal CLI, VS Code
> extension/sidebar, or both?

| Response | Action |
|----------|--------|
| VS Code | Surface the guide's VS Code warning immediately: settings.json is likely ignored, guardrails don't protect that environment. Recommend terminal CLI. Continue audit for terminal sessions. |
| Terminal | Proceed. Mention VS Code caveat in report. |
| Both | Lead with VS Code warning, then audit for terminal. |

## Phase 1: Load sources

1. Read the guide from the harness root
2. WebFetch the gist URL
3. Note material differences between gist and local guide (don't
   block on fetch failure — local guide is sufficient)

## Phase 2: Audit

Read `~/.claude/settings.json`. For each layer, classify:
**present + configured | present + misconfigured | missing.**

| Layer | What to check |
|-------|---------------|
| 1. Sandbox | `sandbox.enabled`, `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands`, `excludedCommands`, `filesystem.allowWrite` paths |
| 2. DCG | Binary exists (`which dcg`). Hook configured in settings.json `hooks.PreToolUse` with Bash matcher. |
| 3. Guard hook | Hook file exists at referenced path. Matcher covers `Edit\|Write\|Bash`. |
| 4. Deny rules | Compare `permissions.deny` array against guide's recommended list. Categorize by coverage: full, partial, missing per category. |
| 5. Pre-commit | `git config --global core.hooksPath` set. Hook file exists and contains `gitleaks`. `which gitleaks` succeeds. |
| 6. Pre-push | Hook file exists at hooks path and contains `gitleaks`. |

**Also check:** `defaultMode` in settings (informational — user
choice), project-local overrides, known gaps and warnings from the
guide (read them from the guide, don't hardcode).

## Phase 3: Report

Per layer:
- Status (present / partial / missing)
- What it does (one sentence, plain language)
- Current config vs. guide recommendation
- Specific fix if needed

End with: overall layer count, known gaps from the guide, day-to-day
practices, and any gist-vs-guide differences found.

## Phase 4: Remediation

On request only. Propose changes, explain what each does, wait for
approval. Never auto-apply.

## Overrides

- **Don't assume the user wants bypass mode.** They may be evaluating.
- **Zero layers configured → suggest sandbox first.** It's the
  strongest single layer. Don't dump all six at once.
- **Read-only.** This skill never writes to settings.json, hook files,
  or any config without explicit user approval per change.

# thischat validation

> Claude Code doesn't expose a session ID and deletes session logs after
> 30 days (with no reliable way to disable this). thischat solves both
> problems: it identifies the current session's log file by matching
> conversation content, archives every session log to a durable location
> on stamp, and adds provenance metadata (which session created this
> file, when) to artifacts. A daily cron job backs up all session logs
> and retro-stamps any files that were missed.
>
> This test doc is for weft users validating the thischat skill on their
> machine. Your Claude instance runs the checks below, generates a
> privacy-redacted report, and you open a GitHub issue with the results
> so the developer can identify platform-specific failures.

## Instructions for the tester's Claude instance

You are running a validation suite for the thischat skill. Execute each
check below. For each, record the actual output. Do not trust exit codes
alone — read and verify the content of every output. At the end, generate
a structured report.

## Checks

### 1. Environment

```bash
uname -s
uname -m
bun --version
claude --version
```

Record OS, architecture, bun version, Claude Code version.

### 2. Weft root resolution

```bash
cat ~/.config/weft/root
```

Verify the path exists and contains `.claude/skills/thischat/`.

```bash
ls "$(cat ~/.config/weft/root)/.claude/skills/thischat/"
```

Record: path exists (yes/no), files found in skill dir (list filenames).

### 3. Symlink chain

```bash
readlink ~/.claude/skills/thischat
```

Verify it resolves to a real directory:

```bash
test -d "$(readlink ~/.claude/skills/thischat)" && echo "resolves" || echo "broken"
```

Record: symlink target, resolves (yes/no).

### 4. Config files

Check existence:

```bash
test -f ~/.config/weft/stamp-projects && echo "stamp-projects: exists" || echo "stamp-projects: missing"
test -d ~/.config/weft/session-archive && echo "session-archive dir: exists" || echo "session-archive dir: missing"
```

Record: which exist, which are missing. (stamp-projects is optional —
missing means archive-only mode.)

### 5. Session discovery

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/thischat.ts"
bun "$SCRIPT"
```

Verify output is a path to an existing `.jsonl` file. Read the first
line and verify it contains a `timestamp` field.

Record: path returned, file exists (yes/no), has timestamp (yes/no).

### 6. Frontmatter stamp

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/thischat.ts"
echo "# stamp test" > /tmp/thischat-verify-fm.md
bun "$SCRIPT" --stamp /tmp/thischat-verify-fm.md
head -4 /tmp/thischat-verify-fm.md
```

Verify frontmatter contains `session:` and `stamped:`. Verify the
session path points to a file in `~/.config/weft/session-archive/`
that exists.

```bash
SESSION=$(grep '^session:' /tmp/thischat-verify-fm.md | sed 's/session: //')
test -f "$SESSION" && echo "OK: archive file exists" || echo "BROKEN: archive file missing"
```

Record: frontmatter present (yes/no), session file exists (yes/no),
archive dir used (yes/no).

### 7. Back stamp

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/thischat.ts"
echo "# back test" > /tmp/thischat-verify-back.md
bun "$SCRIPT" --stamp /tmp/thischat-verify-back.md --back
tail -2 /tmp/thischat-verify-back.md
```

Verify HTML comment `<!-- session: ... | ... -->` present at end.

Record: comment present (yes/no).

### 8. Retro stamp

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/thischat.ts"
echo "# retro test" > /tmp/thischat-verify-retro.md
bun "$SCRIPT" --retro --stamp /tmp/thischat-verify-retro.md
head -4 /tmp/thischat-verify-retro.md
```

Verify it finds a session whose time window contains the file's
birthtime. (File was just created, so the current session should match.)

Record: session found (yes/no), or "(no matching session found)".

### 9. Session archive dry run

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/session-archive.ts"
bun "$SCRIPT" --dry-run 2>&1
```

Verify it produces `Would rsync` and scans projects.

```bash
bun "$SCRIPT" --dry-run 2>&1 | grep -c "unstamped file(s)"
```

Record: rsync line present (yes/no), number of projects scanned,
number of unstamped files found.

### 10. Cron job installation

```bash
bash "$(cat ~/.config/weft/root)/.claude/skills/thischat/install-cron.sh"
```

Then inspect:

```bash
launchctl print gui/$(id -u)/com.weft.session-archive 2>&1 | grep -E "program|arguments|working dir|state|last exit"
```

Record each field. Verify: program path is a real bun binary, script
path is inside the skill dir, state is not "error".

### 11. Skill invocation

Try to use `/thischat` as a skill in this conversation. Verify:

- Did the skill load (SKILL.md found and read)?
- Was a bash command constructed?
- Was a session path returned?

Record: skill loaded (yes/no), command constructed (yes/no), session
path returned (yes/no).

### 12. Provenance convention

Check whether the user's global CLAUDE.md (`~/.claude/CLAUDE.md`)
contains a provenance stamping directive (look for `/thischat --stamp`
or "Provenance" section). If it does not, ask the user:

> "thischat can automatically stamp new artifacts with session provenance
> if you add a directive to your global CLAUDE.md. Want me to add it?
> (See the README's 'Enabling automatic stamping' section for what gets
> added.)"

Record: directive already present (yes/no), user chose to add (yes/no/skipped).

## Report generation

After all checks, generate a markdown report:

```markdown
## thischat validation report

**Date:** <ISO date>
**OS:** <uname -s> <uname -m>
**bun:** <version>
**Claude Code:** <version>

### Results

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Environment | PASS/FAIL | ... |
| 2 | Weft root resolution | PASS/FAIL | ... |
| 3 | Symlink chain | PASS/FAIL | ... |
| 4 | Config files | PASS/FAIL | ... |
| 5 | Session discovery | PASS/FAIL | ... |
| 6 | Frontmatter stamp | PASS/FAIL | ... |
| 7 | Back stamp | PASS/FAIL | ... |
| 8 | Retro stamp | PASS/FAIL | ... |
| 9 | Session archive dry run | PASS/FAIL | ... |
| 10 | Cron job installation | PASS/FAIL | ... |
| 11 | Skill invocation | PASS/FAIL | ... |
| 12 | Provenance convention | PASS/SKIP | ... |

### Failures (if any)

<Detail for each failed check: what was expected, what was found>

### Redaction notice

This report has been reviewed for sensitive information.
Paths are shown as relative to ~ where possible.
No file contents, session data, or project names are included.
```

## Privacy redaction rules

Apply these before generating the report:

- Replace the user's home directory with `~` in all paths
- Replace project directory names with `<project-N>`
- Do not include any JSONL file contents, session IDs, or user messages
- Do not include the contents of `stamp-projects`
- Do not include file contents from stamped files
- Report only structural facts: exists/missing, count, format correctness
- The tester can add additional context manually after reviewing

## GitHub issue template

```
Title: thischat validation: <OS> <arch> — <pass/fail>

Body:
<paste the generated report>

Label: testing
```

Open the issue on the weft repo.

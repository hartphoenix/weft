# Weft Harness — Complete Uninstall

Give this file to Claude Code and say: "Run the weft uninstall
checklist." Claude does all the work. You review one report and
approve what to remove.

---

## Instructions for Claude

You are removing the Weft harness from this machine. This is a
read-only audit followed by a single human review gate followed by
execution of approved removals.

**CRITICAL CONSTRAINT: Do not edit, delete, modify, write, or remove
anything on this machine until Phase 3. Phases 1 and 2 are strictly
read-only. No files, no settings, no symlinks, no configs, no
LaunchAgents — nothing changes until the user has seen the complete
audit report and explicitly told you which items to proceed with.
This includes running the built-in uninstaller — do not run it
automatically. Only report whether it exists.**

### Phase 1: Audit (read-only)

Run every check below in a single pass. Collect all findings silently.
Do not present intermediate results or ask questions. Do not edit or
remove anything. Run checks in parallel where possible.

**Important: capture all paths early.** Several later steps depend on
paths discovered in step A. Record these values and use them throughout
the audit — do not re-read config files that may be deleted during
Phase 3:
- `WEFT_ROOT` — from `~/.config/weft/root`
- `LEARNING_ROOT` — from `config.json` `learningRoot` key, or same
  as `WEFT_ROOT` if not set
- `VOICE_MEMO_ROOT` — from `config.json` `voiceMemoRoot` key, if set

Check all of the following:

**A. Install metadata**
- `cat ~/.config/weft/root` — where the weft repo was cloned
- `cat ~/.config/weft/manifest.json` — what the bootstrap recorded
- `cat ~/.config/weft/config.json` — runtime preferences (note the
  `learningRoot` value if present — learning state may live at a
  different path than the weft repo)
- Check whether `scripts/uninstall.sh` exists in the weft repo (note
  its path for the report — do NOT run it)

**If `~/.config/weft/root` does not exist** (already deleted or never
created), reconstruct the weft root by:
1. Checking symlinks in `~/.claude/skills/` — their targets point
   into the weft repo's `.claude/skills/` directory
2. Checking `~/.claude/settings.json` additionalDirectories for
   paths that contain `.claude/skills/` or end in a repo-like path
3. Checking `~/.claude/CLAUDE.md` for "Harness root:" or path
   resolution lines
4. Asking the user where they cloned the weft repo if all else fails

**B. Skill symlinks in ~/.claude/skills/**
- List every entry in `~/.claude/skills/`
- For each symlink, read its target with `readlink`
- Flag it as weft-related if ANY of these are true:
  - Its target path contains "weft"
  - Its target path matches the WEFT_ROOT discovered in step A
  - Its target no longer exists (broken symlink)
  - Its name matches a known weft skill (see list below) AND its
    target points into a `.claude/skills/` directory structure
- Skill names that have existed across all weft versions: `debugger`,
  `dispatch`, `domain-map`, `domain-update`, `exapt`, `extract`,
  `git-ship`, `handoff-prompt`, `handoff-test`, `intake`,
  `keybindings-help`, `lesson-scaffold`, `loop`, `metaclaude`,
  `newthread`, `persist`, `progress-review`, `quick-ref`, `route`,
  `safety-help`, `schedule`, `session-digest`, `session-discovery`,
  `session-review`, `simplify`, `skill-sharpen`, `startwork`,
  `status-report`, `thischat`, `update-config`, `claude-api`,
  `context-map`

**C. ~/.claude/settings.json**
- Read the full file
- Match against BOTH the string "weft" AND the WEFT_ROOT path from
  step A (the user may have cloned the repo under a different name)
- Check `permissions.additionalDirectories` for entries containing
  "weft", matching WEFT_ROOT, or matching LEARNING_ROOT
- Check `hooks.SessionStart` for entries with commands containing
  "weft" or WEFT_ROOT (two possible formats: new matcher format with
  nested `.hooks[].command`, or old flat format with `.command`)
- Check `hooks.PreToolUse` for entries containing "weft" or WEFT_ROOT
- Check `hooks.PostToolUseFailure` for entries containing "weft" or
  WEFT_ROOT
- Check all other hook types for "weft" or WEFT_ROOT references

**D. ~/.claude/CLAUDE.md**
- Check for `<!-- weft:start -->` and `<!-- weft:end -->` markers
- If found, capture the full content between them (including markers)
- Also grep the entire file for any weft references outside the
  markers: `weft`, `harness root`, `weft:section`, `Weft Harness`,
  path resolution tables pointing to weft paths

**E. ~/.config/weft/ directory**
- List everything recursively
- Note the size of `session-archive/` if it exists
- Note what's in `backups/` if it exists (these are pre-weft copies
  of settings.json and CLAUDE.md)

**F. LaunchAgent (macOS)**
- Check for `~/Library/LaunchAgents/com.weft.session-archive.plist`
- Check if it's currently loaded:
  `launchctl print gui/$(id -u)/com.weft.session-archive`

**G. Learning state and skill-generated directories**
- Check for `<weft-root>/learning/` (or `<learning-root>/learning/`
  if a separate learning root was configured)
- List what files exist in it — look for all of these:
  - `learning/current-state.md`
  - `learning/goals.md`
  - `learning/arcs.md`
  - `learning/.intake-notes.md`
  - `learning/.last-digest-timestamp`
  - `learning/.progress-review-log.md`
  - `learning/relationships.md`
  - `learning/session-logs/` (directory with *.md files)
  - `learning/scaffolds/` (directory with *.md files)
  - `learning/state/` (directory with *.state.json files)
  - `learning/extract/` (staging directory for routed chunks)
  - `learning/agent-inbox/` (routed agent tasks)
  - `learning/route-log.md`
- Check `<root>/background/` (user-dropped intake materials)
- Check `<root>/domains/` (domain graph JSON files from domain-map)
- Check `<root>/threads/` (thread directories from newthread)
- Check `<root>/_routing.md` (routing rules file)

**H. GitHub**
- `gh repo view learning-signals --json name 2>/dev/null` — check
  for the optional signals repo created by intake
- Also check for `<weft-root>/.claude/consent.json`
- If the signals repo exists, check for weft-created issues:
  `gh issue list --repo learning-signals --json title --limit 5 2>/dev/null`

**I. Safer-yolo-mode manual setup (if user followed the guide)**
- Check for `~/.git-hooks/pre-commit` and `~/.git-hooks/pre-push` —
  these are secret-scanning hooks documented in weft's
  `guides/safer-yolo-mode.md`. They may or may not contain weft
  references; read them and check.
- Check: `git config --global --get core.hooksPath` — if it points to
  `~/.git-hooks`, note this (the user may have set it up for weft's
  security guide)

**J. Transcription service (optional component)**
- Check `~/.config/weft/transcribe.log` (already covered by step E,
  but note if it's large)
- Check `~/.config/weft/config.json` for a `voiceMemoRoot` key — if
  present, check that path for `inbox/` and `archive/` directories

**K. Weft repo on disk**
- Check if the weft repo directory still exists at the path from
  `~/.config/weft/root`

---

### Phase 2: Report (read-only — still no edits)

After all checks complete, present **one report** to the user. Do not
edit, delete, or modify anything yet. Format the report as a numbered
checklist. Each item should state:
- What was found
- What the proposed action is
- Whether it's **safe** (config/metadata — no user content lost) or
  **requires review** (contains user-created content)

If the built-in uninstaller (`scripts/uninstall.sh`) exists, mention
it as an option but do not run it without approval.

End the report by asking the user which items to proceed with. **Do
not begin any removals until the user responds.**

Structure the report like this:

```
## Weft Uninstall — Audit Results

Everything checked. Here's what I found. Review the list and tell me
which items to proceed with (e.g., "all", "all except 7", "1-6 and 8").

### Safe to remove (weft metadata, no user content):

[ ] 1. **Skill symlinks** — Found N symlinks in ~/.claude/skills/
       pointing to weft: [list names]. Will delete these symlinks.

[ ] 2. **settings.json: additionalDirectories** — Found N weft
       entries: [list paths]. Will remove these entries.

[ ] 3. **settings.json: hooks** — Found weft entries in [list
       which hook types: SessionStart, PreToolUse, etc.]. Will
       remove them.

[ ] 4. **CLAUDE.md: weft section** — Found section between markers
       (N lines). Will remove it. [File will be deleted entirely /
       File will be preserved with weft section removed.]

[ ] 5. **~/.config/weft/ config files** — Contains: [list].
       Will delete the directory.

[ ] 6. **LaunchAgent** — Found/Not found. [Will unload and delete
       the plist.]

### Requires your review (may contain user content):

[ ] 7. **~/.config/weft/backups/** — Contains pre-weft copies of
       [list files with dates]. These are your original settings.json
       and CLAUDE.md from before weft was installed. Want to restore
       any before I delete them, or just delete?

[ ] 8. **~/.config/weft/session-archive/** — N MB of archived Claude
       session logs. Delete, or move to ~/Desktop/?

[ ] 9. **Learning state** — Found at [path]: [list ALL files and
       directories found, including session-logs/, scaffolds/,
       state/, extract/, agent-inbox/, .progress-review-log.md,
       route-log.md, etc.]. These are your learning profile, goals,
       session logs, and skill-generated data. Delete or keep?

[ ] 10. **Domain graphs** — Found at [path]/domains/: [list files].
        These are concept maps generated by the domain-map skill.
        Delete or keep?

[ ] 11. **Threads** — Found at [path]/threads/: [list directories].
        These are structured threads created by the newthread skill.
        Delete or keep?

[ ] 12. **Background materials** — Found at [path]/background/:
        [list files]. These are materials you dropped in for the
        intake interview. Delete or keep?

[ ] 13. **GitHub learning-signals repo** — Found/Not found.
        [Delete the repo? Note: also has N weft-created issues.]

[ ] 14. **Git hooks (safer-yolo-mode)** — Found/Not found.
        [If ~/.git-hooks/ exists with weft-documented scripts
        and core.hooksPath is set, describe what's there. These
        may be useful independent of weft — ask whether to keep.]

[ ] 15. **Transcription service data** — Found/Not found.
        [If voiceMemoRoot is configured, list what's there.]

[ ] 16. **Weft repo** — Still on disk at [path]. Delete it?
        [Note if learning state or domains live inside it.]

### Informational (no action needed):

- **Artifact stamps** — The thischat skill may have added small
  provenance comments (YAML frontmatter or HTML comments containing
  "session:" and "session-archive") to files in your projects. These
  are inert metadata and harmless. I haven't scanned for them. Let
  me know if you want me to find and remove them.
```

Omit any items where the check found nothing. Adjust numbering
accordingly. Do not pad the report — only list what actually exists.

---

### Phase 3: Execute (only after explicit user approval)

**Do not enter this phase until the user has responded to the Phase 2
report with explicit approval.** "Sounds good" or "go ahead" counts.
Silence does not. If the user hasn't responded, wait.

Execute **only** the items the user approved. Skip everything else.

**Execution order matters.** Process items in this order to avoid
destroying data before the user's choices are honored:
1. Restore backups first (if user wants to restore pre-weft configs)
2. Move session-archive (if user wants it preserved)
3. Remove skill symlinks
4. Edit settings.json (all changes in a single read-modify-write)
5. Edit CLAUDE.md
6. Unload and remove LaunchAgent
7. Remove git hooks and unset core.hooksPath
8. Delete learning state, domains, threads, background (as approved)
9. Delete GitHub repo (if approved)
10. Delete `~/.config/weft/` directory (LAST — other steps may read it)
11. Delete weft repo (if approved)

**How to remove each item type:**

**Symlinks:** `rm <symlink-path>` for each flagged symlink.

**settings.json — additionalDirectories:** Use jq to filter out
matching entries. Use the WEFT_ROOT and LEARNING_ROOT captured in
Phase 1 for exact matching (not just string "weft"):
```bash
jq --arg root "$WEFT_ROOT" --arg lr "$LEARNING_ROOT" '
  .permissions.additionalDirectories = [
    .permissions.additionalDirectories[]
    | select(. != $root and . != $lr)
  ]
' ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json
```

**settings.json — hooks:** Remove entries whose command references
the weft root path. Check all hook types (SessionStart, PreToolUse,
PostToolUseFailure). Handle both formats — matcher-wrapped
(`{matcher, hooks: [{type, command}]}`) and flat (`{type, command}`):
```bash
jq --arg root "$WEFT_ROOT" '
  .hooks |= with_entries(
    .value |= map(
      if .hooks then
        .hooks |= map(select(.command | contains($root) | not))
        | select(.hooks | length > 0)
      elif .command then
        select(.command | contains($root) | not)
      else .
      end
    )
  )
' ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json
```

**CLAUDE.md:** Remove everything between and including the markers.
If the file is empty afterward, delete it:
```bash
awk '
  /<!-- weft:start -->/ { skip=1; next }
  /<!-- weft:end -->/ { skip=0; next }
  !skip { print }
' ~/.claude/CLAUDE.md > ~/.claude/CLAUDE.md.tmp
if [ -z "$(tr -d '[:space:]' < ~/.claude/CLAUDE.md.tmp)" ]; then
  rm ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.tmp
else
  mv ~/.claude/CLAUDE.md.tmp ~/.claude/CLAUDE.md
fi
```
Then check for and remove any stale weft references outside markers.

**LaunchAgent:**
```bash
launchctl bootout "gui/$(id -u)/com.weft.session-archive" 2>/dev/null
rm -f ~/Library/LaunchAgents/com.weft.session-archive.plist
```

**Git hooks (safer-yolo-mode):** If approved:
```bash
rm -f ~/.git-hooks/pre-commit ~/.git-hooks/pre-push
rmdir ~/.git-hooks 2>/dev/null  # only removes if empty
git config --global --unset core.hooksPath
```

**Learning state / domains / threads / background:** `rm -rf` the
approved directories. Use the LEARNING_ROOT captured in Phase 1.

**GitHub repo:**
```bash
gh repo delete "$(gh api user --jq .login)/learning-signals" --yes
```

**~/.config/weft/:** `rm -rf ~/.config/weft/`

**Weft repo:** `rm -rf "$WEFT_ROOT"`

After execution, run the verification checks below and report the
final state.

**Verification checks (run after all removals).** Use the WEFT_ROOT
captured in Phase 1 for path-based checks. If the repo name didn't
contain "weft", grep for both:
```bash
# Symlinks (weft-named, WEFT_ROOT-targeted, and broken)
for link in ~/.claude/skills/*/; do
  [ -L "${link%/}" ] || continue
  target=$(readlink "${link%/}")
  if [[ "$target" == *weft* ]] || [[ "$target" == "$WEFT_ROOT"* ]] || [ ! -e "$target" ]; then
    echo "REMAINING: ${link%/} -> $target"
  fi
done

# Settings (check for both "weft" and the actual root path)
jq '.permissions.additionalDirectories // []' ~/.claude/settings.json 2>/dev/null | grep -iE "weft|$WEFT_ROOT"
jq '[.hooks // {} | to_entries[] | .value[] | .. | strings]' ~/.claude/settings.json 2>/dev/null | grep -iE "weft|$WEFT_ROOT"

# CLAUDE.md
grep -i 'weft:start\|weft:end\|weft:section\|harness.root' ~/.claude/CLAUDE.md 2>/dev/null

# Config directory
ls ~/.config/weft/ 2>/dev/null

# LaunchAgent
ls ~/Library/LaunchAgents/com.weft.session-archive.plist 2>/dev/null

# Git hooks (if user approved removal)
git config --global --get core.hooksPath 2>/dev/null | grep -i git-hooks
ls ~/.git-hooks/ 2>/dev/null
```

If everything is clean, tell the user: **Weft is fully removed.**
If anything remains, identify what and why.

---

## Reference: everything Weft has ever touched

Complete list of filesystem locations, for audit thoroughness:

**Always created by bootstrap:**
- `~/.config/weft/` (directory tree: root, config.json, manifest.json, backups/)
- `~/.claude/skills/<name>` (symlinks, one per skill)
- `~/.claude/settings.json` (modified: additionalDirectories, hooks.SessionStart)
- `~/.claude/CLAUDE.md` (section between `<!-- weft:start/end -->` markers)
- `<learning-root>/learning/session-logs/` (empty directory)
- `<learning-root>/background/` (empty directory)

**Created at runtime by session-start hook:**
- `~/.config/weft/last-fetch`
- `<learning-root>/learning/.last-digest-timestamp`
- May add digestInterval/digestMode keys to `~/.config/weft/config.json`

**Created by intake skill:**
- `<learning-root>/learning/current-state.md`
- `<learning-root>/learning/goals.md`
- `<learning-root>/learning/arcs.md`
- `<learning-root>/learning/.intake-notes.md` (temporary)
- `<learning-root>/learning/relationships.md` (optional)
- `<weft-repo>/.claude/consent.json` (optional)
- GitHub `learning-signals` repo with labels (optional)
- GitHub issues on the signals repo (from session-review, optional)

**Created by session-review, progress-review, startwork:**
- `<learning-root>/learning/session-logs/*.md`
- `<learning-root>/learning/.progress-review-log.md`
- Updates to `learning/current-state.md`, `goals.md`, `arcs.md`

**Created by lesson-scaffold:**
- `<learning-root>/learning/scaffolds/*.md`

**Created by domain-map, domain-update:**
- `<learning-root>/domains/*.domain.json`
- `<learning-root>/domains/.domain-map-state.md` (temporary)
- `<learning-root>/domains/.domain-update-state.md` (temporary)
- `<learning-root>/learning/state/*.state.json`

**Created by newthread, route:**
- `<learning-root>/threads/<name>/_thread.md`
- `<learning-root>/_routing.md`
- `<learning-root>/learning/route-log.md`

**Created by extract:**
- `<learning-root>/learning/extract/*.md` (staging area)
- `<learning-root>/learning/agent-inbox/` (routed tasks)

**Created by thischat/install-cron (manual setup only):**
- `~/Library/LaunchAgents/com.weft.session-archive.plist`
- `~/.config/weft/session-archive/` (archived session logs)
- `~/.config/weft/session-archive.log`
- `~/.config/weft/stamp-projects`
- Provenance stamps in user files (YAML frontmatter or HTML comments)

**Created by transcription service (manual setup only):**
- `~/.config/weft/transcribe.log`
- `<voiceMemoRoot>/inbox/*.md` (transcripts)
- `<voiceMemoRoot>/archive/audio/*.m4a` (moved audio)

**Documented in safer-yolo-mode guide (manual setup only):**
- `~/.git-hooks/pre-commit` (secret scanning)
- `~/.git-hooks/pre-push` (secret scanning)
- `git config --global core.hooksPath ~/.git-hooks`

**Created by dispatch, status-report (MetaClaude only):**
- `<project>/notepad/active-sessions/dispatch-*.prompt` (temporary)
- `<project>/notepad/active-sessions/*.json` (status digests)

**Never modified by weft:**
- Shell profiles (~/.bashrc, ~/.zshrc, ~/.bash_profile, ~/.zprofile)
- PATH or environment variables
- npm/bun global packages
- Project-level .claude/ directories
- ~/.claude/projects/ (Claude Code's internal project data)
- ~/.claude/settings.local.json
- MCP server configurations
- VS Code or IDE settings

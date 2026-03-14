# thischat — testing request

**/thischat** is a skill that solves 3 problems in Claude Code:

- no quick way to get the file path of a session log while in that session
- artifacts (e.g. plans, skills) don't tell you what session they're from (hard to trace intent)
- Claude Code **silently deletes session logs after 30 days**.

How it solves them:

- **Session identification** — finds current session's log file with a script
- **Provenance stamping** — writes metadata into files you create (see README for configuring this in CLAUDE.md)
- **Session archival** — copies all session logs to a durable location outside Claude Code's cleanup path, via a daily cron job

See the README for full features info. The skill is part of [weft](https://github.com/hartphoenix/weft) (a personal development harness for Claude Code), but you don't need to use the rest of weft to benefit from it.

## What I need from you

 Everything works on my machine — I need to verify it works on others'. Your Claude runs a test and generates a privacy-redacted report. Takes <5 min.

## Setup

**If you use the weft harness:**

```
cd <your-weft-clone>
git fetch && git checkout thischat-migration
bash scripts/bootstrap.sh
bash "$(cat ~/.config/weft/root)/.claude/skills/thischat/install-cron.sh"
```

**If you just want the skill + cron job (no harness):**

```
git clone https://github.com/hartphoenix/weft.git
cd weft
git checkout thischat-migration
mkdir -p ~/.config/weft
echo "$PWD" > ~/.config/weft/root
ln -s "$PWD/.claude/skills/thischat" ~/.claude/skills/thischat
bash .claude/skills/thischat/install-cron.sh
```

You'll also need bun installed (`brew install oven-sh/bun/bun`). macOS only.

For archive-only mode (daily backup of session logs, no stamping), skip creating `~/.config/weft/stamp-projects` — the cron job will archive logs but won't touch your files.

For stamping, create `~/.config/weft/stamp-projects` with one project directory per line — these are the directories whose `.md` files will get provenance metadata added by the daily cron.

## Run the tests

Ask your Claude instance:

> Run the thischat test suite per ~/.claude/skills/thischat/TESTING.md and generate a report

Review for anything you don't want shared. Then open a GitHub issue on the weft repo with the report. Title format and template are at the bottom of TESTING.md.

## to uninstall everything:

```
launchctl bootout gui/$(id -u)/com.weft.session-archive
rm ~/Library/LaunchAgents/com.weft.session-archive.plist
rm -rf ~/.config/weft/session-archive  # delete archived logs
```
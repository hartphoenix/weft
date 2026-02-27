# Weft Harness

A personal development harness for Claude Code. It learns how you learn,
tracks your growth, and adapts its behavior to where you are right now.

Drop some materials, run a 15-minute interview, and get a system that
sharpens itself every time you use it.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and working
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated — used
  for usage signals. Run `gh auth status` to check. If you need to set it up:
  [GitHub CLI quickstart](https://docs.github.com/en/github-cli/github-cli/quickstart)
- [`jq`](https://jqlang.github.io/jq/download/) — used by the installer for safe JSON manipulation
- `git` — you probably already have this

Tested on macOS. Linux should work — all scripts use portable bash
and POSIX utilities. Windows users: use WSL.

## Install

```bash
git clone https://github.com/hartphoenix/weft ~/weft
cd ~/weft && bash scripts/bootstrap.sh
```

You can clone anywhere — bootstrap resolves paths from wherever you
run it. `~/weft` is the recommended default, and this README uses it
in all examples.

Bootstrap does four things:
1. Registers skills globally so they're available in any project
2. Registers a session-start hook that checks your learning state
3. Writes a path-resolution section to `~/.claude/CLAUDE.md`
4. Creates a config directory (`~/.config/weft/`) with your update preference

Everything is tracked in a manifest (`~/.config/weft/manifest.json`)
and backed up. Run `bash scripts/uninstall.sh` to reverse it cleanly.

## Quick start

### 1. (Optional) Load your background

Drop files into `~/weft/background/` before running intake. The more
signal you provide, the sharper your starting profile:

- **Code you've written** — shows what you can build and how you think
- **Resumes or portfolios** — background, experience, trajectory
- **Writing samples** — communication style, how you explain things
- **Conversation exports** — past Claude/ChatGPT transcripts that show
  your working patterns
- **Course materials** — syllabi, assignments, lecture notes for what
  you're currently learning

The background folder is optional. If you skip it, the interview covers
everything — it just takes a few more questions.

### 2. Run intake

Start Claude Code in **any project directory** and run:

```
/intake
```

The intake interview has four phases:

1. **Discover** — scans your background materials (if any) to build a
   starting picture
2. **Interview** — conversational, ~10-15 minutes. Covers your
   background, goals, current skills, how you learn, and how you like
   to work
3. **Synthesize** — generates your personalized configuration and
   learning state
4. **Write** — presents everything for your approval before writing
   any files

Nothing is written without your explicit OK.

### 3. Start working

After intake, use Claude Code normally in any project. The harness works
in the background. See **The learning loop** below.

## The learning loop

The harness improves your profile every time you use it. Here's the
cycle:

1. **Work** — use Claude Code normally in any project
2. **Review** — run `/session-review` when you finish a work session.
   It analyzes what you did, quizzes you on 4-6 concepts, and updates
   your scores and gap classifications.
3. **Plan** — next time you start working, `/startwork` reads your
   updated state and proposes what to focus on. It runs automatically
   at session start via the hook, or invoke it directly.
4. **Reflect** — after 3+ sessions, `/startwork` automatically
   dispatches `/progress-review` to detect cross-session patterns:
   stalls, regressions, goal drift, arc readiness. You can also run
   `/progress-review` directly anytime.

The more sessions you complete, the sharper the system gets. Concept
scores are quiz-verified, not self-reported — so the profile converges
on reality.

## Privacy

Your learning profile stays local by default:

- `background/` and `learning/` are gitignored out of the box
- During intake, you choose whether your `~/.claude/CLAUDE.md` content is shared or private
- Nothing leaves your machine without your explicit action

## What intake creates

| File | Purpose |
|------|---------|
| `~/.claude/CLAUDE.md` | Personalized configuration (written within `<!-- weft -->` markers, won't overwrite your other content) |
| `learning/goals.md` | Your aspirations as states of being, not skill checklists |
| `learning/arcs.md` | Capability clusters — groups of skills serving your goals |
| `learning/current-state.md` | Concept inventory — scores, gap types, evidence sources |

After sessions, `/session-review` also creates session logs in
`learning/session-logs/`.

## Skills

All skills are invoked with `/skill-name` in Claude Code.

### Core loop

| Skill | What it does |
|-------|-------------|
| **/intake** | Onboarding interview — bootstraps your profile from background materials and conversation |
| **/startwork** | Session planner — reads your state and proposes what to focus on |
| **/session-review** | End-of-session analysis, quiz, and learning state update |
| **/progress-review** | Cross-session pattern analysis — detects stalls, regressions, and goal drift |

### Working tools

| Skill | What it does |
|-------|-------------|
| **/lesson-scaffold** | Paste a URL to a lesson plan or tutorial – Adapts the plan to fit your learning style & goals. |
| **/quick-ref** | Fast, direct answers. Flags structural gaps in one sentence. |
| **/debugger** | Visibility-first debugging — gets the full error before guessing |
| **/handoff-test** | Run this to audit Claude's work artifacts for self-containedness before compaction/clear, so the next session or agent starts with a full game plan. |
| **/handoff-prompt** | Run this to generate a handoff prompt for the next agent when context is running low |

### Automatic dispatch

Some skills run automatically without you invoking them:

- **/startwork** dispatches **/progress-review** when 3+ sessions have
  accumulated since the last review, but you can also run it yourself.
- The **session-start hook** checks your learning state and suggests
  `/intake` if you haven't run it, or `/startwork` if your profile
  hasn't updated recently.
- **/quick-ref** and **/debugger** activate contextually based on what
  you're doing — no slash command needed.

## Everything is editable

The intake gives you a starting point, not a lock-in. Every generated
file is plain markdown. Edit `~/.claude/CLAUDE.md` to change how the system
behaves. Edit `learning/current-state.md` to correct a score. The
system reads what's there — if you change it, it adapts.

## Update

```bash
cd ~/weft && git pull
```

Skills update immediately — they're loaded from the clone directory,
so a pull is all it takes. Learning state (`~/weft/learning/`) is
never overwritten by pull — it's gitignored.

If you set `"updates": "notify"` (default), the harness tells you when
updates are available at session start.

## Recommended: Install a command guard

AI coding agents occasionally attempt destructive commands (`git reset
--hard`, `rm -rf`, force pushes). [DCG (Destructive Command Guard)](https://github.com/Dicklesworthstone/destructive_command_guard)
intercepts these before execution. Install it once and it protects all
your projects — see the [DCG README](https://github.com/Dicklesworthstone/destructive_command_guard?tab=readme-ov-file#dcg-destructive-command-guard)
for setup instructions.

## Data sharing (optional)

During `/intake`, you'll be asked if you want to share learning data
to GitHub. If you opt in:

**Developer signals** — at the end of each `/session-review`, a short
signal is posted to the developer's repo (`hartphoenix/weft-signals`)
with your feedback on how the tool worked, plus learning metrics
(concept scores, gap types, progress patterns). This data helps improve
the harness — it's how bugs get found and skills get sharpened. You see
every signal before it sends and approve or skip each one.

**Progress repo** — a public GitHub repo is created on your account
(`your-username/learning-signals`). When you run `/progress-review`,
a summary posts there. Teachers, mentors, or peers can watch the repo
and comment with guidance.

**What's shared:** concept scores, gap types, progress patterns, goals,
and growth edges.
**What's never shared:** conversation content, code, file paths,
background materials, or raw quiz answers.

**Current status:** Signal dispatch (you → developer) works now.
The teacher response loop (teacher comments → surfaced in your next
`/startwork`) is designed and coming in a future update. For now,
teacher feedback works through normal GitHub issue comments — you'll
see it when you check your progress repo.

**To invite a teacher:** send them your progress repo link. They Watch
it on GitHub. Add their GitHub handle to `learning/relationships.md`
and `/progress-review` will assign issues to them automatically.

To opt out of all data sharing, delete `~/weft/.claude/consent.json`.

## Under the hood

These files are created and managed by skills during normal use.
You don't need to touch them, but knowing they exist helps if you're
debugging or customizing.

| File | Created by | Purpose |
|------|-----------|---------|
| `learning/session-logs/YYYY-MM-DD.md` | session-review | One file per reviewed session. YAML frontmatter + markdown body. |
| `learning/scaffolds/` | lesson-scaffold | Restructured learning materials with concept classifications |
| `learning/relationships.md` | intake (if opted in) | Teacher/mentor handles and signal repo config |
| `learning/.intake-notes.md` | intake | Resume checkpoint if intake is interrupted mid-interview |
| `learning/.progress-review-log.md` | progress-review | Tracks review windows and deferred findings |

### Session-start hook

When you open Claude Code, a hook runs automatically. It checks:

- Whether you've run `/intake` yet (suggests it if not)
- Whether a previous `/intake` was interrupted (offers to resume)
- Whether your learning profile is stale (suggests `/startwork`)
- Whether harness updates are available (if `"updates": "notify"`)

## Uninstall

```bash
bash ~/weft/scripts/uninstall.sh
```

Removes the settings.json entries, the CLAUDE.md section, and the
config directory. Learning state is preserved — you're told where it
is and can delete it manually.

## Troubleshooting

**Intake interrupted mid-interview:** Run `/intake` again. It detects
the interrupted state and offers to resume where you left off.

**Skills not activating:** Run `bash ~/weft/scripts/bootstrap.sh`
to re-register. Bootstrap is idempotent — safe to run multiple times.

**Session-review says no learning state:** Run `/intake` first. The
review needs the profile that intake creates.

**Update check not working:** Verify your weft directory is a git
repo with a remote: `cd ~/weft && git remote -v`. The hook fetches
in the background — it won't block your session.

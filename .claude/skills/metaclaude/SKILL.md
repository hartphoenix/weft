---
trigger: "metaclaude"
description: "Toggle MetaClaude on/off, switch models, and manage session instructions"
---

# MetaClaude Toggle

Parse the user's arguments and run the toggle script or manage instruction state.

## Toggle and mode commands

```bash
# No args — toggle on/off
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh

# With args:
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh on
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh off
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --dev
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --prod
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh mode dev
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh mode prod
```

## Model switch commands

```bash
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --sl   # Qwen3-4B-Thinking (local)
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --ml   # Qwen3-8B (local)
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --ll   # Gemma-3-12B (local)
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --mch  # Haiku (API)
bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/toggle.sh --mco  # Opus-4.6 (API)
```

Model switch auto-enables MetaClaude if it's off.

## Instruction commands

Instructions persist across turns until cleared or MetaClaude disabled.

- `+[text]` — append instruction: write text as a new line to `~/.claude/metaclaude/instruction`
- `-[text]` — replace instruction: overwrite `~/.claude/metaclaude/instruction` with text
- `-[]` — clear instruction: remove `~/.claude/metaclaude/instruction`

Handle these directly via Bash — no script needed:

```bash
# Append
echo "instruction text" >> ~/.claude/metaclaude/instruction

# Replace
echo "instruction text" > ~/.claude/metaclaude/instruction

# Clear
rm -f ~/.claude/metaclaude/instruction
```

## Combined commands

Model switch and instruction can be combined in any order:
- `/metaclaude --ml +[focus on error handling]` → switch model, then append instruction
- `/metaclaude -[only track tests] --sl` → replace instruction, then switch model

## Intent mapping

- "metaclaude" / "metaclaude on/off" → toggle or set state
- "metaclaude dev" / "metaclaude --dev" → enable in dev mode
- "metaclaude prod" / "metaclaude --prod" → enable in prod mode
- "metaclaude mode dev/prod" → switch mode without toggling
- "metaclaude --ml" / "metaclaude --sl" etc. → switch model (auto-enables)
- "metaclaude +[text]" → append instruction
- "metaclaude -[text]" → replace instruction
- "metaclaude -[]" → clear instruction

Report the new state to the user.

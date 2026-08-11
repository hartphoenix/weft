#!/bin/bash
# Voice memo transcription — triggered by .command file or terminal.
# Selects mlx-whisper when available; falls back to whisper-server
# (starting it on demand) if mlx-whisper is missing.
# Delegates all pipeline logic to scripts/transcribe/index.ts.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export HOME="${HOME:-/Users/rhhart}"

INPUT_DIR="$HOME/Desktop/Transcribe"
WHISPER_SERVER="/opt/homebrew/bin/whisper-server"
MODEL="$HOME/Applications/whisper.cpp/models/ggml-medium.en.bin"
PORT=8080
LOG="$HOME/.config/weft/transcribe.log"
ENSEMBLE_PY="$HOME/Documents/GitHub/ensemble/.venv/bin/python"

mkdir -p "$(dirname "$LOG")"

log() { echo "$1" | tee -a "$LOG"; }

shopt -s nullglob
files=("$INPUT_DIR"/*.m4a "$INPUT_DIR"/*.mp3 "$INPUT_DIR"/*.wav \
       "$INPUT_DIR"/*.mp4 "$INPUT_DIR"/*.webm "$INPUT_DIR"/*.mkv "$INPUT_DIR"/*.mov)
shopt -u nullglob
if [ ${#files[@]} -eq 0 ]; then
    log "No media files in $INPUT_DIR"
    exit 0
fi

log ""
log "$(date): ${#files[@]} file(s) queued"
for f in "${files[@]}"; do
    log "  $(basename "$f")"
done

# Prefer mlx-whisper (no HTTP server needed). Only start whisper-server
# if mlx-whisper isn't importable — that's the fallback path.
NEED_SERVER=1
if [ -x "$ENSEMBLE_PY" ] && "$ENSEMBLE_PY" -c "import mlx_whisper" >/dev/null 2>&1; then
    NEED_SERVER=0
    log "backend: mlx-whisper"
fi

if [ "$NEED_SERVER" = "1" ]; then
    if ! curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
        log "Starting whisper-server (mlx-whisper fallback)..."
        $WHISPER_SERVER -m "$MODEL" --convert --port $PORT >> "$LOG" 2>&1 &
        for i in $(seq 1 30); do
            if curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        if ! curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
            log "ERROR: whisper-server failed to start"
            exit 1
        fi
        log "whisper-server ready"
    else
        log "whisper-server already running"
    fi
fi

/opt/homebrew/bin/bun "$HOME/Documents/GitHub/weft/scripts/transcribe/index.ts" \
    --dir "$INPUT_DIR" --emit human 2>> "$LOG"
STATUS=$?

if [ $STATUS -eq 0 ]; then
    log "$(date): Done"
else
    log "$(date): Failed (exit $STATUS)"
fi

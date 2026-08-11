#!/bin/bash
# Thin wrapper: unsandboxed via excludedCommands so whisper/MPS get GPU/Metal access.
# readlink -f so this works when invoked through a symlink on PATH
# (~/.local/bin/transcribe.sh → weft/scripts/transcribe.sh). Without it,
# $0 is the symlink's location and dirname lands in the wrong place.
exec bun "$(dirname "$(readlink -f "$0")")/transcribe/index.ts" "$@"

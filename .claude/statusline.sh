#!/usr/bin/env bash
# Claude Code status line.
#
# Reads the status-line JSON payload on stdin and prints:
#   <model>  ctx <n>%  5h <bar> <n>% ↻<reset>  7d <bar> <n>% ↻<reset>
#   ➜ <dir> git:(<branch>) ✗
#
# When the first line won't fit the pane, it wraps at the 5h/7d boundary and
# the 7d block moves to its own line, indented to align under 5h.
#
# Rate-limit percentages come from Claude Code as fraction-of-cap utilization —
# the server computes them against whatever plan is active. Nothing here is tied
# to a subscription tier; change plans and the bars re-scale on their own.
#
# Bars round to the nearest 10% (one segment per 10%). Numbers round to the
# nearest whole percent.

shopt -s extglob

# Without this, ${#var} counts bytes rather than characters and every width
# measurement below is wrong by 2 per multi-byte glyph. Only LC_CTYPE, so we
# don't disturb date's formatting.
export LC_CTYPE=UTF-8

input=$(cat)

esc=$'\033'
reset="${esc}[0m"
bold="${esc}[1m"
dim="${esc}[2m"
cyan="${esc}[36m"
blue="${esc}[34m"

# -1 is the "field absent" sentinel. rate_limits only appears once Claude Code
# has seen a response from the API, so it is missing on a cold session.
IFS=$'\t' read -r model ctx fh_pct fh_reset sd_pct sd_reset cwd < <(
  jq -r '[
    (.model.display_name // "-"),
    (.context_window.used_percentage // -1),
    (.rate_limits.five_hour.used_percentage  // -1),
    (.rate_limits.five_hour.resets_at        // 0),
    (.rate_limits.seven_day.used_percentage  // -1),
    (.rate_limits.seven_day.resets_at        // 0),
    (.workspace.current_dir // .cwd // "")
  ] | @tsv' <<<"$input"
)

# Pane width in columns, or 0 when we can't tell. stdout is a pipe here, so
# tput reports terminfo's default rather than the real size and COLUMNS is
# unset — the controlling terminal is the only honest source.
# 2>/dev/null must precede < /dev/tty: redirections apply left to right, and a
# failure to open /dev/tty is reported before a later stderr redirect exists.
cols=
if size=$(stty size 2>/dev/null < /dev/tty); then
  cols=${size#* }
fi
[[ "$cols" =~ ^[1-9][0-9]*$ ]] || cols=${COLUMNS:-}
[[ "$cols" =~ ^[1-9][0-9]*$ ]] || cols=0

# Display width of a string, ignoring ANSI escapes. Every glyph used here is
# East-Asian-Neutral, so one character is one column. Sets VW to avoid a fork.
VW=0
vwidth() {
  local s=${1//$esc\[*([0-9;])m/}
  VW=${#s}
}

# Ten segments, one per 10%, rounded to nearest. Space-separated so adjacent
# glyphs stay visually distinct.
bar() {
  awk -v p="$1" 'BEGIN {
    f = int(p / 10 + 0.5)
    if (f < 0) f = 0
    if (f > 10) f = 10
    for (i = 0; i < 10; i++) printf "%s%s", (i ? " " : ""), (i < f ? "⬢" : "⬡")
  }'
}

# Green under half, yellow past half, red past 80%.
pct_color() {
  awk -v p="$1" 'BEGIN { print (p >= 80 ? 31 : (p >= 50 ? 33 : 32)) }'
}

round() { awk -v p="$1" 'BEGIN { printf "%d", int(p + 0.5) }'; }

has_pct() { awk -v p="$1" 'BEGIN { exit !(p >= 0) }'; }

# Epoch seconds -> "1:10p", or "Sat 11:00a" when the reset is not today.
fmt_reset() {
  local ep=$1 t d
  [[ "$ep" =~ ^[0-9]+$ ]] && [ "$ep" -gt 0 ] || return 0
  t=$(date -r "$ep" "+%-I:%M%p" 2>/dev/null) || return 0
  t=$(tr 'APM' 'apm' <<<"$t")
  t=${t%m}
  d=$(date -r "$ep" "+%F" 2>/dev/null)
  if [ "$d" = "$(date "+%F")" ]; then
    printf '%s' "$t"
  else
    printf '%s %s' "$(date -r "$ep" "+%a")" "$t"
  fi
}

# "  5h ⬢ ⬢ ⬡ …  17% ↻1:10p" — two leading spaces separate it from what precedes.
# Two spaces after the bar, not one: the segment glyphs render optically wide
# and a single space reads as none.
window() {
  local label=$1 pct=$2 ep=$3 color when out
  has_pct "$pct" || return 0
  color=$(pct_color "$pct")
  out="  ${dim}${label}${reset} ${esc}[${color}m$(bar "$pct")${reset}"
  out+="  ${esc}[1;${color}m$(round "$pct")%${reset}"
  when=$(fmt_reset "$ep")
  [ -n "$when" ] && out+=" ${dim}↻${when}${reset}"
  printf '%s' "$out"
}

head="${bold}${model}${reset}"
if has_pct "$ctx"; then
  head+="  ${dim}ctx${reset} ${esc}[1;$(pct_color "$ctx")m$(round "$ctx")%${reset}"
fi

fh=$(window "5h" "$fh_pct" "$fh_reset")
sd=$(window "7d" "$sd_pct" "$sd_reset")

vwidth "$head"; w_head=$VW
vwidth "$fh";   w_fh=$VW
vwidth "$sd";   w_sd=$VW

# Wrap at the 5h/7d boundary only when the joined line would overflow. Leave a
# column of slack so a full-width line never brushes the edge.
if [ -n "$sd" ] && [ "$cols" -gt 0 ] && [ $((w_head + w_fh + w_sd)) -gt $((cols - 1)) ]; then
  # Align the 7d bar under the 5h bar. Both labels are two columns wide, so
  # indenting past the head by the same two spaces that precede 5h lines the
  # bars up. Held even when the wrapped line then clips at the right edge —
  # alignment is worth more here than the tail of a reset time.
  indent=$((w_head + 2))
  printf '%s%s\n%*s%s' "$head" "$fh" "$indent" "" "${sd:2}"
else
  printf '%s%s%s' "$head" "$fh" "$sd"
fi

[ -n "$cwd" ] && cd "$cwd" 2>/dev/null
printf '\n%s➜%s %s%s%s' "${esc}[1;32m" "$reset" "$cyan" "$(basename "${cwd:-$PWD}")" "$reset"

if git rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || echo detached)
  printf ' %sgit:(%s)%s' "$blue" "$branch" "$reset"
  git --no-optional-locks diff-index --quiet HEAD -- 2>/dev/null || printf ' %s✗%s' "${esc}[31m" "$reset"
fi

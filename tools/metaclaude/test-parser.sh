#!/usr/bin/env bash
# test-parser.sh — validates accumulator response parsing logic
# Run: bash tools/metaclaude/test-parser.sh
# Tests the <inject>/<context> tag parser and fallback behavior
# that will be added to observer.sh by the accumulator plan.
set -uo pipefail

PASS=0
FAIL=0

check() {
    local label="$1" expected_inject="$2" expected_context="$3" input="$4"

    # --- parser logic (matches plan step 3 exactly) ---
    CLEAN_RESPONSE="$input"
    INJECT_CONTENT=""
    CONTEXT_CONTENT=""
    PARSE_SUCCESS=false

    if printf '%s' "$CLEAN_RESPONSE" | grep -qi '<inject>'; then
        INJECT_CONTENT=$(printf '%s' "$CLEAN_RESPONSE" | perl -0777 -ne 'print $1 if /<inject>(.*?)<\/inject>/si')
        PARSE_SUCCESS=true
    fi
    if printf '%s' "$CLEAN_RESPONSE" | grep -qi '<context>'; then
        CONTEXT_CONTENT=$(printf '%s' "$CLEAN_RESPONSE" | perl -0777 -ne 'print $1 if /<context>(.*?)<\/context>/si')
    fi
    if [ "$PARSE_SUCCESS" = "false" ]; then
        INJECT_CONTENT="$CLEAN_RESPONSE"
        CONTEXT_CONTENT=""
    fi
    # Trim: strip leading/trailing whitespace including newlines.
    # perl -pe trims the whole string (not per-line like sed).
    INJECT_CONTENT=$(printf '%s' "$INJECT_CONTENT" | perl -0777 -pe 's/\A\s+//; s/\s+\z//')
    CONTEXT_CONTENT=$(printf '%s' "$CONTEXT_CONTENT" | perl -0777 -pe 's/\A\s+//; s/\s+\z//')

    TRIMMED="$INJECT_CONTENT"
    if [ "$TRIMMED" = "[no comment]" ]; then TRIMMED=""; fi
    # --- end parser ---

    if [ "$TRIMMED" = "$expected_inject" ] && [ "$CONTEXT_CONTENT" = "$expected_context" ]; then
        echo "  PASS: $label"
        ((PASS++))
    else
        echo "  FAIL: $label"
        echo "    inject:  got='$TRIMMED' expected='$expected_inject'"
        echo "    context: got='$CONTEXT_CONTENT' expected='$expected_context'"
        ((FAIL++))
    fi
}

echo "=== Parser tests ==="

check "canonical" \
    "observation text" "session summary" \
    "<inject>observation text</inject><context>session summary</context>"

check "silence with context" \
    "" "session summary" \
    "<inject>[no comment]</inject><context>session summary</context>"

check "reversed tag order" \
    "observation" "summary" \
    "<context>summary</context><inject>observation</inject>"

check "multiline content" \
    "line one" "summary here" \
    $'<inject>\nline one\n</inject>\n<context>\nsummary here\n</context>'

check "inject only, no context tag" \
    "just inject" "" \
    "<inject>just inject</inject>"

check "fallback: no tags at all" \
    "plain text observation" "" \
    "plain text observation"

check "fallback: empty response" \
    "" "" \
    ""

check "tags with extra whitespace" \
    "obs" "ctx" \
    "  <inject>  obs  </inject>  <context>  ctx  </context>  "

check "mixed case tags" \
    "obs" "ctx" \
    "<Inject>obs</Inject><Context>ctx</Context>"

check "content with special chars" \
    "the user's goal was X — not Y" "goal: X, decided at turn 3" \
    "<inject>the user's goal was X — not Y</inject><context>goal: X, decided at turn 3</context>"

echo ""
echo "=== Tool-collapsing tests ==="

# The jq collapse transform — extracted as a function for testing
COLLAPSE_JQ='
    [ reduce .[] as $item (
        [];
        if ($item.content | test("^\\[.+\\]$"))
        then
          if (length > 0 and (.[-1] | has("_tools")))
          then .[-1]._tools += [$item.content[1:-1]]
          else . + [{"_tools": [$item.content[1:-1]]}]
          end
        else . + [$item]
        end
      ) | .[] |
      if has("_tools")
      then {"role":"assistant","content":(._tools | group_by(.) | map("\(.[0]) x\(length)") | join(", ") | "[tools: \(.)]")}
      else .
      end
    ]
'

collapse_check() {
    local label="$1" input="$2" expected_count="$3" expected_content="$4"

    local result
    result=$(echo "$input" | jq "$COLLAPSE_JQ" 2>&1)
    local rc=$?

    if [ $rc -ne 0 ]; then
        echo "  FAIL: $label (jq error: $result)"
        ((FAIL++))
        return
    fi

    local count
    count=$(echo "$result" | jq 'length')

    # Check count
    if [ "$count" != "$expected_count" ]; then
        echo "  FAIL: $label — expected $expected_count entries, got $count"
        echo "    output: $result"
        ((FAIL++))
        return
    fi

    # Check no _tools leak
    local tools_leak
    tools_leak=$(echo "$result" | jq '[.[] | select(has("_tools"))] | length')
    if [ "$tools_leak" != "0" ]; then
        echo "  FAIL: $label — _tools key leaked into output"
        ((FAIL++))
        return
    fi

    # Check every entry has role and content
    local valid_fields
    valid_fields=$(echo "$result" | jq '[.[] | select(has("role") and has("content"))] | length')
    if [ "$valid_fields" != "$count" ]; then
        echo "  FAIL: $label — not all entries have role+content"
        ((FAIL++))
        return
    fi

    # Check specific content if provided
    if [ -n "$expected_content" ]; then
        local match
        match=$(echo "$result" | jq -r "any(.[]; .content == $expected_content)")
        if [ "$match" = "true" ]; then
            echo "  PASS: $label"
            ((PASS++))
        else
            echo "  FAIL: $label — content check failed"
            echo "    output: $(echo "$result" | jq -c .)"
            ((FAIL++))
        fi
    else
        echo "  PASS: $label"
        ((PASS++))
    fi
}

# Mixed run: text, 4x[Bash], [Read], [Agent], text, user
collapse_check "mixed run collapses tool sequence" \
    '[{"role":"assistant","content":"starting work"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Read]"},
      {"role":"assistant","content":"[Agent]"},
      {"role":"assistant","content":"done with research"},
      {"role":"user","content":"thanks"}]' \
    "4" \
    '"[tools: Agent x1, Bash x4, Read x1]"'

# All tools: 10x[Bash]
collapse_check "all tools collapse to one" \
    '[{"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"}]' \
    "1" \
    '"[tools: Bash x10]"'

# No tools: passthrough
collapse_check "no tools passthrough" \
    '[{"role":"user","content":"hello"},
      {"role":"assistant","content":"hi there"}]' \
    "2" \
    ""

# Single tool between text
collapse_check "single tool between text" \
    '[{"role":"assistant","content":"thinking"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"result"}]' \
    "3" \
    '"[tools: Bash x1]"'

# Empty array
collapse_check "empty array passthrough" \
    '[]' \
    "0" \
    ""

# Two separate tool runs don't merge
collapse_check "separate tool runs stay separate" \
    '[{"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"[Bash]"},
      {"role":"assistant","content":"found it"},
      {"role":"assistant","content":"[Read]"},
      {"role":"assistant","content":"[Read]"}]' \
    "3" \
    ""

echo ""
echo "=== Accumulator lifecycle tests ==="

ACCUMULATOR_FILE="$TMPDIR/test-metaclaude-accumulator"
rm -f "$ACCUMULATOR_FILE"

# Accumulator read helper (matches observer.sh logic)
read_accumulator() {
    awk -v max=500 '{
        if (len + length + 1 > max) exit
        if (NR > 1) { printf "\n"; len++ }
        printf "%s", $0
        len += length
    }' "$1"
}

# Test: first observation — file absent, read returns empty
ACCUMULATOR=""
if [ -f "$ACCUMULATOR_FILE" ]; then
    ACCUMULATOR=$(read_accumulator "$ACCUMULATOR_FILE")
fi
if [ "$ACCUMULATOR" = "" ]; then
    echo "  PASS: first observation reads empty"
    ((PASS++))
else
    echo "  FAIL: first observation should be empty, got='$ACCUMULATOR'"
    ((FAIL++))
fi

# Test: write accumulator, read it back
CONTEXT_CONTENT="user goal: build auth. decided JWT at turn 2."
printf '%s' "$CONTEXT_CONTENT" > "$ACCUMULATOR_FILE"
ACCUMULATOR=$(read_accumulator "$ACCUMULATOR_FILE")
if [ "$ACCUMULATOR" = "$CONTEXT_CONTENT" ]; then
    echo "  PASS: accumulator persists across reads"
    ((PASS++))
else
    echo "  FAIL: accumulator read mismatch, got='$ACCUMULATOR'"
    ((FAIL++))
fi

# Test: overwrite with new content (simulates next turn)
CONTEXT_CONTENT="user goal: build auth. JWT chosen. now on middleware."
printf '%s' "$CONTEXT_CONTENT" > "$ACCUMULATOR_FILE"
ACCUMULATOR=$(read_accumulator "$ACCUMULATOR_FILE")
if [ "$ACCUMULATOR" = "$CONTEXT_CONTENT" ]; then
    echo "  PASS: accumulator overwrites on update"
    ((PASS++))
else
    echo "  FAIL: accumulator overwrite mismatch"
    ((FAIL++))
fi

# Test: >500 byte truncation (line-aware, not byte-aware)
# Write 12 lines of ~50 chars each (600 bytes total). Truncation should
# drop the last lines that would exceed 500 bytes, not split mid-line.
LONG_CONTENT=""
for i in $(seq 1 12); do
    LONG_CONTENT="${LONG_CONTENT}line $i: $(printf 'x%.0s' $(seq 1 42))
"
done
printf '%s' "$LONG_CONTENT" > "$ACCUMULATOR_FILE"
ACCUMULATOR=$(awk -v max=500 '{
    if (len + length + 1 > max) exit
    if (NR > 1) { printf "\n"; len++ }
    printf "%s", $0
    len += length
}' "$ACCUMULATOR_FILE")
ACCUM_LEN=${#ACCUMULATOR}
if [ "$ACCUM_LEN" -le 500 ] && [ "$ACCUM_LEN" -gt 0 ]; then
    echo "  PASS: >500 byte content truncated to $ACCUM_LEN (line-aware, <=500)"
    ((PASS++))
else
    echo "  FAIL: expected <=500 bytes, got $ACCUM_LEN"
    ((FAIL++))
fi

# Test: truncated content doesn't break jq payload composition
if jq -n --arg accumulator "$ACCUMULATOR" '{accumulator: $accumulator}' > /dev/null 2>&1; then
    echo "  PASS: truncated accumulator valid in jq payload"
    ((PASS++))
else
    echo "  FAIL: truncated accumulator broke jq"
    ((FAIL++))
fi

# Test: multi-byte UTF-8 not split by truncation
# Write content with multi-byte chars (em dashes, curly quotes) near the boundary
MULTIBYTE_CONTENT='user goal: build auth — JWT chosen. gap: "correct shape, wrong boundary" pattern active. edge: middleware ordering.'
printf '%s' "$MULTIBYTE_CONTENT" > "$ACCUMULATOR_FILE"
ACCUMULATOR=$(awk -v max=500 '{
    if (len + length + 1 > max) exit
    if (NR > 1) { printf "\n"; len++ }
    printf "%s", $0
    len += length
}' "$ACCUMULATOR_FILE")
if jq -n --arg accumulator "$ACCUMULATOR" '{accumulator: $accumulator}' > /dev/null 2>&1; then
    echo "  PASS: multi-byte UTF-8 accumulator valid in jq"
    ((PASS++))
else
    echo "  FAIL: multi-byte accumulator broke jq (likely split UTF-8)"
    ((FAIL++))
fi

# Test: session clear (rm -f)
rm -f "$ACCUMULATOR_FILE"
if [ ! -f "$ACCUMULATOR_FILE" ]; then
    echo "  PASS: session clear removes accumulator"
    ((PASS++))
else
    echo "  FAIL: accumulator file still exists after clear"
    ((FAIL++))
fi

# Test: empty context doesn't overwrite existing accumulator
printf '%s' "existing summary" > "$ACCUMULATOR_FILE"
CONTEXT_CONTENT=""
if [ -n "$CONTEXT_CONTENT" ]; then
    printf '%s' "$CONTEXT_CONTENT" > "$ACCUMULATOR_FILE"
fi
ACCUMULATOR=$(read_accumulator "$ACCUMULATOR_FILE")
if [ "$ACCUMULATOR" = "existing summary" ]; then
    echo "  PASS: empty context preserves existing accumulator"
    ((PASS++))
else
    echo "  FAIL: empty context overwrote accumulator, got='$ACCUMULATOR'"
    ((FAIL++))
fi

# Cleanup
rm -f "$ACCUMULATOR_FILE"

echo ""
echo "=== Fingerprint skip tests ==="

# The fingerprint jq expression — extracts non-tool content for hashing
FINGERPRINT_JQ='
  [.[] | select(.content | test("^\\[tools: ") | not) |
   .role + ":" + .content] | join("|")
'

fp_check() {
    local label="$1" input1="$2" input2="$3" expect_same="$4"

    local fp1 fp2
    fp1=$(echo "$input1" | jq -r "$FINGERPRINT_JQ" 2>/dev/null | shasum | cut -d' ' -f1)
    fp2=$(echo "$input2" | jq -r "$FINGERPRINT_JQ" 2>/dev/null | shasum | cut -d' ' -f1)

    if [ "$expect_same" = "true" ]; then
        if [ "$fp1" = "$fp2" ]; then
            echo "  PASS: $label"
            ((PASS++))
        else
            echo "  FAIL: $label — expected same, got fp1=$fp1 fp2=$fp2"
            ((FAIL++))
        fi
    else
        if [ "$fp1" != "$fp2" ]; then
            echo "  PASS: $label"
            ((PASS++))
        else
            echo "  FAIL: $label — expected different, both=$fp1"
            ((FAIL++))
        fi
    fi
}

# Same window → same fingerprint
fp_check "same window same fingerprint" \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]' \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]' \
    "true"

# Added tool summary → same fingerprint (tools are filtered out)
fp_check "added tool summary same fingerprint" \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]' \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"[tools: Bash x3, Read x1]"},{"role":"assistant","content":"hi"}]' \
    "true"

# New user message → different fingerprint
fp_check "new user message different fingerprint" \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]' \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"},{"role":"user","content":"now do X"}]' \
    "false"

# New assistant text → different fingerprint
fp_check "new assistant text different fingerprint" \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]' \
    '[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"},{"role":"assistant","content":"also this"}]' \
    "false"

# Empty window → consistent fingerprint
fp_check "empty window consistent fingerprint" \
    '[]' \
    '[]' \
    "true"

echo ""
echo "=== Results ==="
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

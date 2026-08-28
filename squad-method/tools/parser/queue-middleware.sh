#!/bin/bash
# squad-method/tools/parser/queue-middleware.sh
# The Universal Middleware for Requirement Queue execution

set -euo pipefail

PROMPT="$1"
PHASE="${2:-dev-task}" # The skill/phase to hand off to
PARSER_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${TMPDIR:-/tmp}/squad-public/.queue"
mkdir -p "$OUTPUT_DIR"

# Ensure temporary files are always cleaned up, even if the script crashes or is interrupted (Ctrl+C)
trap 'rm -f "$PARSER_DIR"/queue-manager.cjs 2>/dev/null' EXIT

# Unified Node.js helper for Queue Operations with Atomic Locking
cat << 'EOF' > "$PARSER_DIR/queue-manager.cjs"
const fs = require('fs');

const cmd = process.argv[2];
const file = process.argv[3];
const arg1 = process.argv[4];

const lockFile = file + '.lock';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function withLock(fn) {
  let locked = false;
  let retries = 0;
  while (!locked && retries < 100) { // 100 * 100ms = 10s deadlock timeout
    try {
      fs.mkdirSync(lockFile);
      locked = true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Deadlock check: is the lock folder older than 10 seconds?
        const stats = fs.statSync(lockFile, { throwIfNoEntry: false });
        if (stats && (Date.now() - stats.mtimeMs > 10000)) {
          fs.rmSync(lockFile, { recursive: true, force: true });
          continue; // Try acquiring again
        }
        await sleep(100);
        retries++;
      } else {
        throw e;
      }
    }
  }
  
  if (!locked) {
    console.error("Lock timeout");
    process.exit(1);
  }

  try {
    return await fn();
  } finally {
    fs.rmSync(lockFile, { recursive: true, force: true });
  }
}

async function run() {
  if (cmd === 'read-old') {
    if (!fs.existsSync(file)) { console.log(""); return; }
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data.requirements || data.requirements.length === 0) { console.log(""); return; }
      const reqs = data.requirements.map(r => r.raw_text_quote).join("\n- ");
      console.log("- " + reqs);
    } catch (e) { console.log(""); }
    return;
  }
  
  await withLock(async () => {
    if (!fs.existsSync(file)) {
       if (cmd === 'print' || cmd === 'poll' || cmd === 'filter') console.log("EMPTY");
       return;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.requirements || data.requirements.length === 0) {
       if (cmd === 'print' || cmd === 'poll' || cmd === 'filter') console.log("EMPTY");
       return;
    }
    
    if (cmd === 'print') {
      console.log("\n📋 The Queue:");
      data.requirements.forEach((req, idx) => {
        let icon = '⚠️';
        if (req.fragment_type === 'actionable') icon = '✅';
        if (req.fragment_type === 'junk') icon = '🗑️ ';
        console.log(`  [${idx + 1}] [${icon} ${req.fragment_type.toUpperCase()}] "${req.raw_text_quote}"`);
      });
      console.log("");
    } 
    else if (cmd === 'override') {
      const index = parseInt(arg1, 10) - 1;
      if (index >= 0 && index < data.requirements.length) {
        if (data.requirements[index].fragment_type === 'junk') {
          data.requirements[index].fragment_type = 'uninterpreted';
          console.log(`\n➡️ Rescued item ${index + 1} from JUNK -> UNINTERPRETED`);
        } else if (data.requirements[index].fragment_type === 'uninterpreted') {
          data.requirements[index].fragment_type = 'actionable';
          console.log(`\n➡️ Upgraded item ${index + 1} from UNINTERPRETED -> ACTIONABLE`);
        } else {
          data.requirements[index].fragment_type = 'uninterpreted';
          console.log(`\n➡️ Downgraded item ${index + 1} from ACTIONABLE -> UNINTERPRETED`);
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } else {
        console.log("\n❌ Invalid item number.");
      }
    }
    else if (cmd === 'filter') {
      data.requirements = data.requirements.filter(r => r.fragment_type !== 'junk');
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      if (data.requirements.length === 0) console.log("EMPTY");
    }
    else if (cmd === 'poll') {
      const polled = data.requirements.shift();
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(JSON.stringify(polled));
    }
  });
}
run();
EOF

LATEST_QUEUE=$(ls -t "$OUTPUT_DIR"/queue-*.json 2>/dev/null | head -n 1 || true)
PREV_REQS=""
if [ -n "$LATEST_QUEUE" ]; then
  PREV_REQS=$(node "$PARSER_DIR/queue-manager.cjs" "read-old" "$LATEST_QUEUE")
  if [ -n "$PREV_REQS" ]; then
    echo "[QueueMiddleware] Found unfinished queue. Cleaning and merging with new prompt..."
  fi
  rm -f "$LATEST_QUEUE"
fi

echo "[QueueMiddleware] Analyzing prompt..."
QUEUE_FILE="$OUTPUT_DIR/queue-$(date +%s).json"

# Export PREV_REQS so prompt-parser.cjs can read it
export PREV_REQS
node "$PARSER_DIR/prompt-parser.cjs" "$PROMPT" > "$QUEUE_FILE"

# Interactive Loop
while true; do
  PRINT_OUT=$(node "$PARSER_DIR/queue-manager.cjs" "print" "$QUEUE_FILE")
  if [ "$PRINT_OUT" == "EMPTY" ]; then
    echo "🤖 (Conversational Mode): Hello! You didn't provide any specific action requirements."
    echo "Exiting gracefully."
    exit 0
  fi
  
  echo "$PRINT_OUT"
  
  read -p "Proceed (Y) | Abort (n) | Override a tag (Type the number): " ACTION
  
  if [[ "$ACTION" =~ ^[Nn]$ ]]; then
    echo "Execution cancelled by user."
    exit 0
  elif [[ "$ACTION" =~ ^[0-9]+$ ]]; then
    node "$PARSER_DIR/queue-manager.cjs" "override" "$QUEUE_FILE" "$ACTION"
  else
    # Assume Proceed on 'Y', 'y', or empty
    break
  fi
done

# Filter remaining junk before execution loop starts
FILTER_OUT=$(node "$PARSER_DIR/queue-manager.cjs" "filter" "$QUEUE_FILE")
if [ "${FILTER_OUT:-}" == "EMPTY" ]; then
    echo "Queue is empty after filtering junk. Exiting."
    exit 0
fi

# ---------------------------------------------------------
# Execution Loop
# ---------------------------------------------------------
ATTEMPTS=0
MAX_DEPTH=15

echo ""
echo "========================================"
echo "          STARTING EXECUTION            "
echo "========================================"

while true; do
  POLLED=$(node "$PARSER_DIR/queue-manager.cjs" "poll" "$QUEUE_FILE")
  
  if [ "$POLLED" == "EMPTY" ]; then
    echo "✅ [QueueMiddleware] Queue is empty. All requirements fulfilled."
    break
  fi
  
  FRAGMENT_TYPE=$(echo "$POLLED" | grep -o '"fragment_type":"[^"]*"' | cut -d'"' -f4 || echo "uninterpreted")
  RAW_TEXT=$(echo "$POLLED" | grep -o '"raw_text_quote":"[^"]*"' | cut -d'"' -f4 || echo "")
  
  echo "----------------------------------------"
  echo "📦 POLLED REQUIREMENT: $RAW_TEXT"
  
  if [ "$FRAGMENT_TYPE" == "uninterpreted" ]; then
    echo "⚠️ [Uninterpreted] This requirement is too vague to execute."
    echo "Prompting user for clarification..."
    read -p "Please clarify this requirement: " CLARIFICATION
    node "$PARSER_DIR/prompt-parser.cjs" "$RAW_TEXT. $CLARIFICATION" >> "$QUEUE_FILE.new"
    echo "Re-evaluated and pushed to queue."
    continue
  fi
  
  # ACTIONABLE - Execute
  echo "🚀 [Actionable] Executing via phase: $PHASE"
  
  ATTEMPTS=$((ATTEMPTS+1))
  if [ $ATTEMPTS -gt $MAX_DEPTH ]; then
    echo "❌ [Circuit Breaker] Max queue depth / retry limit reached ($MAX_DEPTH). Drifting detected."
    break
  fi
  
  echo "   -> (Mocking execution of: $RAW_TEXT)"
  echo "   -> Reviewing execution..."
done

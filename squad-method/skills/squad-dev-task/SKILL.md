---
name: squad-dev-task
description: >
  End-to-end story implementation — analyse, spec, implement, test, review, PR.
  Six phases with user gates. Use when user says "dev task", "implement story",
  "dev this", provides a story number, or runs /dev-task.
---

# SQUAD-Public Dev Task — End-to-End Story Implementation

Six phases, each with user gates. All 27 agents participate per their lens.

## SKILL BOOTSTRAP (execute before Phase 1 — non-negotiable)

### B1 — Always load first

```
squad-method/config.yaml                      ← team config, model routing mode, stack
squad-method/agents/_base-agent.md            ← grounding waterfall + progress doc + orchestrator + token discipline
squad-method/fragments/agent-orchestrator.md  ← R1-R11 parallel dispatch rules
squad-method/fragments/context-injection-protocol.md ← --context flag handling
```

### B2 — Check for existing progress report (anti-amnesia)

```bash
ls squad-method/output/progress/progress-dev-task-* 2>/dev/null
```

- **If found:** Read it. "Found in-progress work: [story] from [date]. Resume from Phase [N]? [Yes/Restart]"
- **If not found:** Create `squad-method/output/progress/progress-dev-task-[story-id]-[date].md` NOW.
- **Update at END of every phase, BEFORE the user gate.** Never skip this — it is the anti-amnesia record.

### B3 — Run grounding waterfall (from _base-agent.md)

```
Level 0: <repo>/CLAUDE.md + DEEP-CONTEXT.md + KG_REPORT.md    ← ALWAYS first
Level 1a: graph.json KG queries                                ← before any grep
          reverseDeps(), godNodes(), untestedFiles(), ripple()
Level 1b: grep / code search                                   ← after KG
Level 2:  fragments (rubric, stack, cloud, tracker)            ← conditional
Level 4:  nothing found → STOP, declare [DESIGN-N] assumptions, await user approval
```

**DO NOT skip Level 0 and proceed to Level 1c (grep). KG first.**

### B4 — Detect dispatch path (auto)

```
Agent() tool in toolbox?  → PATH A — Claude Code, max 5 parallel
claude CLI on PATH?       → PATH B — CLI subprocess, max 3 parallel
Neither?                  → PATH C — Sequential (Windsurf/Cursor/Kiro/Gemini/Antigravity)
```

Write to progress report: `dispatch_path: [A/B/C]`

### B5 — Model routing (resolve before dispatching any agent)

Check `config.yaml → model_routing.mode` first:
- `mode: quality` → upgrade ALL to **heavy**
- `mode: budget` → downgrade ALL to **fast**
- `mode: balanced` → use per-agent defaults below

| Agent | Default Tier | Reason | Blast-radius auto-upgrade? |
|---|---|---|---|
| **Nova** | default | Requirements analysis, AC structuring | No |
| **Atlas** | **heavy** | Architecture impact, blast radius, god-node analysis | Yes — KG degree > 20 |
| **Forge** | default | Code implementation, follows patterns | Yes — touching god nodes |
| **Compass** | default | Product validation, scope check | No |
| **Cipher** | default | Test generation, coverage analysis | No |
| **Raven** | **heavy** | Adversarial review, logic bugs, second-order effects | Yes |
| **Sentinel** | default | Test architecture, pyramid balance | No |

Blast-radius auto-upgrade rule: if ANY file in scope has KG degree > 20 → upgrade Atlas and Raven to heavy regardless of mode.

### B6 — Parallel dispatch plan per phase

PATH A/B (true parallel):
```
Phase 1 — ANALYSE:        Nova → [Atlas parallel with Oracle if research needed]
Phase 1.5 — SCAFFOLD:     Cipher writes characterization tests (solo)
Phase 2 — SPEC:           Forge + Compass → PARALLEL (independent lenses)
Phase 3 — IMPLEMENT:      Forge (solo, sequential by design)
Phase 4 — TEST:           Cipher (solo, sequential by design)
Phase 5 — REVIEW:         Raven + Sentinel + Forge + Cipher → PARALLEL (max 4)
Phase 6 — PR:             Forge (solo)
```

PATH C (sequential simulation — maintain same dependency order, run one at a time):
```
Phase 5 order: Forge → Raven → Cipher → Sentinel (critical-path first: Raven is longest)
```

### B7 — Emit bootstrap confirmation before Phase 1

```
━━━ SQUAD DEV TASK — BOOTSTRAP COMPLETE ━━━
Story:          [story ID or description]
Dispatch path:  [A / B / C]
Model routing:  [balanced — Atlas+Raven=heavy, rest=default]
Progress report:[path — created / resumed from Phase N]
Grounding:      L0 loaded: [CLAUDE.md: YES/NO] [DEEP-CONTEXT.md: YES/NO] [KG_REPORT: YES/NO]
Context inject: [paths or "none"]
━━━ Proceeding to Phase 1 — ANALYSE ━━━
```

**Phase-gated loading (load each fragment at the phase that needs it — not before):**
- Phase 1: `squad-method/agents/nova.md`, `squad-method/agents/atlas.md`, `squad-method/fragments/kg-query-protocol.md`
- Phase 1.5: `squad-method/fragments/tdd-scaffold.md`
- Phase 2: `squad-method/agents/forge.md`, `squad-method/agents/compass.md`
- Phase 3: `squad-method/agents/forge.md` (if not loaded), `squad-method/fragments/review-rubric.md`
- Phase 4: `squad-method/agents/cipher.md`, `squad-method/fragments/tdd-workflow.md`
- Phase 5: `squad-method/agents/raven.md`, `squad-method/agents/sentinel.md`, `squad-method/fragments/review-protocol.md`
- Phase 6: `squad-method/fragments/tracking-protocol.md`

---

## Phase 1 — ANALYSE (Nova + Atlas)

**Load now:** `squad-method/agents/nova.md`, `squad-method/agents/atlas.md`, `squad-method/fragments/kg-query-protocol.md`

### 1a. Detect Input Mode

Parse `$ARGUMENTS`:
- Matches tracker ID pattern → **Tracker Mode**: fetch story details
- Everything else → **Description Mode**: treat as story description

### 1b. Fetch or Structure Requirements

**Tracker Mode:**
Use tracker MCP tools if available to fetch story details, AC, linked items.

**Description Mode (Agentic Requirement Queue):**
You act as the Interactive Queue Manager. Do NOT parse the prompt yourself.
1. Execute the parser on the raw prompt: `node squad-method/tools/parser/prompt-parser.cjs "[YOUR_PROMPT_HERE]"`
2. Present the parsed JSON to the user in this chat UI, clearly showing the `actionable`, `uninterpreted`, and `junk` tags.
3. Pause and ask the user: "Review this queue. Reply Y to proceed, or tell me if you want to override any tags (e.g. 'rescue item 2 from junk')."
4. If the user overrides tags, manually update the JSON in your context.
5. Once approved, use the `actionable` queue items as your strict AC for Phase 2.

### 1c. Architecture Impact (Atlas)

**Step 1 — READ CONTEXT (before any grep):**
- Read `<repo>/CLAUDE.md` — per-repo context with KG summary, god nodes, untested files, communities
- Read `<repo>/DEEP-CONTEXT.md` if available — architecture overview
- Read `<repo>/knowledge-graph-out/KG_REPORT.md` if exists — full KG analysis
- Read `complete-flow.md` at root for cross-repo understanding

**Step 2 — QUERY KG (before any grep):**
If `<repo>/knowledge-graph-out/graph.json` exists:
- Query reverse dependencies for every file likely to change
- Check god node status (degree > 30) for every file in scope
- Check test coverage for every file in scope
- Run 2-hop ripple analysis from the entry points
- See `squad-method/fragments/kg-query-protocol.md` for query recipes

**Step 3 — GREP (only for pattern-matching):**
Use grep only to find code patterns and similar implementations.
Do NOT use grep for impact analysis — use KG for that.

Atlas assesses:
1. Repos affected
2. Files to change (specific paths, verified via KG + Grep)
3. Reverse dependencies for each file (from KG, not grep)
4. God nodes in the change path (from KG)
5. Test coverage gaps (from KG)
6. Cross-repo implications
7. Performance considerations
8. Security implications

For EVERY claim, cite the file path and line number.
If unverifiable: `[ASSUMPTION-N]: [what] — CONFIDENCE: UNCERTAIN`

### 1c. Context Digest (MANDATORY — Phase 1 is INCOMPLETE without this)

Before the user gate, produce a **Context Digest** block. If any field is empty
→ Phase 1 is incomplete. Do NOT proceed until all fields have a value or "none found".

```
━━━ CONTEXT DIGEST ━━━

Files Read:
  ✅/❌ CONTEXT.md — [repo] ([N] lines)
  ✅/❌ DEEP-CONTEXT.md — [repo] ([N] lines)
  ✅/❌ KG_REPORT.md — [N] nodes, [N] edges
  ✅/❌ complete-flow.md

Scope Analysis (from KG):
  Files in change path: [N]
  God nodes in scope: [list or "none"]
  Untested files in scope: [list or "none"]
  Cross-community changes: [YES — communities X, Y / NO]

Existing Patterns Found:
  - [pattern description] — [file:line citation]
  (or "none found — see [DESIGN-N] assumptions below")

Blast Radius: [LOW / MEDIUM / HIGH]
  Reverse dependencies: [N] files
  Test files covering scope: [N]
  Communities affected: [N]

Assumptions:
  [ASSUMPTION-1]: [description] — CONFIDENCE: [HIGH/MEDIUM/UNCERTAIN]
```

**USER GATE:** "Review analysis. Anything to add or correct? [Continue/Adjust]"

---

---

## Phase 1.5 — TEMPORARY TEST SCAFFOLD (Characterization)

**Load now:** `squad-method/fragments/tdd-scaffold.md`

Write characterization tests BEFORE implementation to capture current behavior.
Follow the full protocol in `tdd-scaffold.md`.

**Quick summary:**
1. Identify 3-5 critical functions in the modification area
2. Write `// SQUAD:characterization-test` tagged tests capturing current behavior
3. Run them — ALL must pass (they test existing code, not new code)
4. If any fail → existing bug. Report to user: "Found pre-existing bug in [file:line]. Include in scope? [Yes/No]"
5. After Phase 3: re-run characterization tests and report any behavioral changes

**USER GATE:** "Characterization tests written: [N]. All passing. Continue to spec? [Continue]"

---

## Phase 2 — SPEC (Forge + Compass)

**Load now:** `squad-method/agents/forge.md`, `squad-method/agents/compass.md`

### 2a. Technical Specification (Forge)

Forge writes the implementation spec:
- Exact files to create/modify (list each with justification)
- Function signatures
- Data model changes
- Error handling strategy
- Integration points

**MINIMALITY GATE (Forge):**
Forge MUST include in the spec:
```
Change Summary:
  Files to modify:  [N] — [list each with 1-line justification]
  Files to create:  [N] — [list each with why it can't be added to existing file]
  Estimated lines:  ~[N]
  Alternative considered: [describe a simpler approach and why it was rejected]
```
If no alternative was considered → spec is incomplete. If the alternative has fewer touch points and still satisfies the AC → use the alternative.

### 2b. Product Validation (Compass)

Compass validates:
- Does this solve the customer problem?
- Is the scope exactly what was asked?
- Any unnecessary scope?
- **Is there a simpler way to achieve this?** Compass independently evaluates whether the proposed spec is the minimum-viable approach.

### 2c. Architecture Minimality Check (Atlas)

Atlas validates the spec's approach:
- Is this the least-invasive architecture that satisfies the AC?
- Does it touch any god nodes unnecessarily?
- What is the blast radius of the proposed changes?
- **Propose at least one alternative** with fewer cross-component changes

### 2d. KG Blast Radius Display

Before the user gate, show the blast radius for each file in the spec:

```
📊 KG Blast Radius:
  File                          Degree  Reverse Deps  Test Coverage
  ─────────────────────────────────────────────────────────────────
  lib/generate/ide-skills.js    5       3 files       ⚠️ UNTESTED
  lib/init.js                   5       1 file        ⚠️ UNTESTED
  ─────────────────────────────────────────────────────────────────
  Total reverse deps: [N] | Tests covering scope: [N] | God nodes: [N]
  Blast Radius: [LOW / MEDIUM / HIGH]
```

**USER GATE:** "Review spec. Change plan: [N] files, ~[N] lines. Blast radius: [LOW/MEDIUM/HIGH]. Alternative: [brief]. [Approve/Revise/Use alternative]"

---

## Phase 3 — IMPLEMENT (Forge)

**Load now:** `squad-method/fragments/review-rubric.md`

### 3a. Pre-Check

```bash
git status
git branch --show-current
```

Determine: create branch, stay on branch, or switch branch (per `_base-agent.md` Git Workflow).

### 3b. Implement

Forge implements per the approved spec:
- Follow existing code patterns (Grounding L1a)
- Minimal changes — only what AC requires
- Self-review against rubric checks as you code
- Stage specific files only
- **STOP after each file** and ask: "Am I still on the minimum path?"
- **If you find yourself changing a file not in the spec** — STOP, present to user: "I need to also change [file] because [reason]. Approve?"

### 3c. Minimality Self-Check + Self-Review

Before presenting to user, Forge runs:

**1. Minimality Self-Check (FIRST):**
```
MINIMALITY SELF-CHECK:
  Files changed: [N]  — matches spec? [YES/NO]
  Files added:   [N]  — each justified? [YES/NO]
  Unplanned changes: [list any files not in the original spec]
  Drive-by refactors: [NONE / list]
  New abstractions:   [NONE / list with justification]
```
If any unplanned changes exist → remove them or present to user for approval.

**2. Rubric checks:**
- M-1 through M-8 (MINIMALITY checks — see `rubric/base.md`)
- C-1 through C-N (CRITICAL checks)
- U-1 through U-N (universal checks)
Fix any issues found before proceeding.

**3. Run FULL test suite:**
```bash
[detected_test_command]
```
If any EXISTING tests fail → diagnose and fix before proceeding. New tests passing but old tests failing = regression = CRITICAL.

### 3d. Re-Run Characterization Tests (from Phase 1.5)

```bash
[detected_test_command]  # with characterization test filter
```

If any characterization tests FAIL → behavioral change detected:
```
⚠️ Behavioral changes detected:
  - [test name]: Expected [X], now returns [Y]
Approve these changes? [Yes / Revert / Adjust]
```

### 3e. Intermediate Diff Preview

Show the diff with KG annotations before proceeding to test phase:

```
📋 Diff Preview (KG-annotated):
  + lib/generate/ide-skills.js (+15 lines) — degree=5, 3 rev deps, UNTESTED
  + lib/init.js (+35 lines) — degree=5, 1 rev dep, UNTESTED
  Total: +50 lines, 0 deletions

  KG Impact: 4 reverse dependencies will be affected
  Untested files changed: 2 (consider adding tests in Phase 4)
```

**USER GATE:** "Implementation complete. [N] files changed, [N] lines. Minimality check: [PASS/findings]. Characterization tests: [all pass / N behavioral changes]. [Continue to tests/Revise]"

---

## Phase 4 — TEST (Cipher)

**Load now:** `squad-method/agents/cipher.md`, `squad-method/fragments/tdd-workflow.md`

### 4a. Detect Test Framework

Read existing test files to learn patterns:
- Framework (Jest, Mocha, pytest, Go test, etc.)
- Structure and conventions
- Mocking approach
- Assertion style

### 4b. Write Tests

Cipher writes tests following existing patterns:
- Unit tests for new logic
- Integration tests for changed contracts
- Edge case coverage from AC
- Error path tests

### 4c. Run Tests

```bash
[detected_test_command]
```

If failures: diagnose test bug vs code bug.
- Test bug → fix
- Code bug → report to user

**USER GATE:** "Tests passing. [Continue to review/Add more tests]"

---

## Phase 5 — REVIEW (Raven + Sentinel + Forge + Cipher)

**Load now:** `squad-method/agents/raven.md`, `squad-method/agents/sentinel.md`,
  `squad-method/fragments/review-protocol.md`

Dispatch agents in parallel:

**Forge** — code quality:
- Idiomatic for the detected stack?
- Follows project patterns?
- Minimal and surgical changes?

**Raven** — adversarial:
- Hidden bugs? Null checks? Boundary conditions?
- What happens when assumptions break?
- Second-order effects?

**Cipher** — test adequacy:
- Edge cases covered?
- Tests prove correctness, not just execution?
- Every new code path tested?

**Sentinel** — test architecture:
- Tests at the right layer?
- Test pyramid balanced?
- Risk coverage adequate?

**Context Verification Checkpoint (2.1.4):** Before reporting findings, each reviewer MUST check:
- Does the implementation reference specific CONTEXT.md sections?
- Does it contradict KG data (e.g., agent said "no existing patterns" but KG shows relevant nodes)?
- If agent output ignores context → add CRITICAL finding: "Context not consumed — [specific claim] contradicts KG data at [file:line]"

Consolidated report:
```
CRITICAL: [N] | MAJOR: [N] | MINOR: [N] | NIT: [N]
Verdict: APPROVE / REQUEST CHANGES
[Per-agent verdicts]

Context Verification:
  ✅/❌ Implementation references CONTEXT.md? [YES/NO — specific section]
  ✅/❌ KG data respected? [YES/NO — any contradictions]
```

**USER GATE:** "Review complete. [Fix findings/Accept/Discuss]"

If CRITICAL findings: fix → re-review.

---

## Phase 6 — PR (Forge)

**Load now:** `squad-method/fragments/tracking-protocol.md`

### 6a. Check PR State

```bash
gh pr list --state open --head "$(git branch --show-current)" 2>/dev/null
```

### 6b. Commit & PR

Per `_base-agent.md` Git Workflow:
- Stage specific files
- Commit with descriptive message
- Create or update PR

### 6c. Track Operation

```bash
echo '{"ts":"[ISO_DATE]","command":"dev-task","repo":"[REPO]","story":"[STORY]","outcome":"[completed|user_aborted]","phases_completed":[N],"review_verdict":"[APPROVE|REQUEST_CHANGES]","findings":{"critical":[N],"major":[N],"minor":[N],"nit":[N]},"discussions_count":[N],"assumptions_count":[N]}' >> squad-method/output/tracking.jsonl
```

## Behavioral Rules

1. **NEVER skip a user gate.** Every phase transition requires user approval.
2. **NEVER fabricate file paths, test results, or tracker data.**
3. **NEVER implement beyond the AC.** No bonus features, no extra refactoring.
4. **Grounding waterfall is mandatory.** Search codebase before inventing patterns.
5. **Tag all assumptions** `[ASSUMPTION-N]` — compile at each gate.
6. **Agent discussions** — if agents disagree, trigger Discussion Protocol.
7. **Track the operation** — final step, always.
8. **TDD when possible** — write test first, then implementation.
9. **Self-review before team review** — Forge checks rubric before Phase 5.
10. **MINIMUM CHANGE IS A HARD CONSTRAINT** — not a nice-to-have. Every change must be the smallest diff that satisfies the AC. Count files and lines. If a simpler path exists, take it.
11. **ALWAYS consider an alternative approach** — before speccing, propose at least one simpler option. Compare touch-point counts. User decides.
12. **REVIEWERS MUST AUDIT MINIMALITY FIRST** — before checking code quality, Phase 5 reviewers must independently assess whether a simpler approach existed. This is check M-1 in the rubric.
13. **REGRESSION = CRITICAL** — if existing tests break after implementation, that is a CRITICAL finding. New tests passing does not offset broken old tests.
14. **NO UNPLANNED FILES** — if implementation requires changing a file not in the approved spec, STOP and get user approval before proceeding.

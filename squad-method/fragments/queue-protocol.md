---
name: queue-protocol
description: Rules for agents interacting with the universal requirement queue.
---

# The Universal Requirement Queue Protocol

All prompts passed into SQUAD-Public slash commands (`/dev-task`, `/review-pr`, etc.) are now intercepted by the Queue Middleware.

## How it works
1. **LLM Parser (Maker-Checker)**: An LLM analyzes the raw prompt and outputs a strict JSON Array of Requirements categorized as actionable, uninterpreted, or junk.
2. **Interactive Queue Manager**: The user is given a chance to review the captured requirements and override the LLM's classification before execution begins.
3. **Execution Loop**: The queue polls elements one by one.
   - If `actionable`: Handed to the original skill's DAG (e.g. `dispatch.sh`) for execution.
   - If `uninterpreted`: Execution pauses, and the user is prompted for clarification.

## Rules for Agents
- **Do not parse the original user prompt directly**. You will receive an isolated, highly specific `actionable` sub-requirement. Fulfill ONLY that requirement.
- **Pushing to Queue**: If you encounter a downstream error (e.g., test suite fails) that requires a separate sub-task to resolve, output a strict JSON to `.queue.json` using the atomic locking protocol (`fs.mkdirSync(".queue.json.lock")`) to dynamically append the requirement to the queue safely.
- **Anti-Drift**: If you retry the exact same approach and output the same codebase hash, the Queue Middleware's circuit breaker will terminate your loop. Course correct dynamically based on review feedback.

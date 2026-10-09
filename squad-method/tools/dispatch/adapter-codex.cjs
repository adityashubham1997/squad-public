'use strict';

/**
 * Codex (OpenAI) Dispatch Adapter (Path B — CLI Subprocess)
 *
 * OpenAI Codex CLI supports spawning background agent sessions.
 * Primary models: GPT-4o, GPT-4o-mini, o3, o4-mini
 * Secondary: Anthropic Claude (via API key)
 *
 * Capabilities:
 *   - Parallel subagents via CLI subprocess (max 3 concurrent)
 *   - Per-agent model selection within OpenAI family
 *   - Reasoning effort parameter for o-series models
 *   - Multi-model: OpenAI native + Anthropic via API
 *
 * Hook enforcement: SCRIPT (hooks.sh — skill must call it)
 */

var BaseAdapter = require('./adapter-base.cjs');
var providers = require('../router/providers.cjs');

function CodexAdapter(config) {
  BaseAdapter.call(this, 'codex', config);
}
CodexAdapter.prototype = Object.create(BaseAdapter.prototype);
CodexAdapter.prototype.constructor = CodexAdapter;

/**
 * Dispatch a single agent via codex CLI.
 */
CodexAdapter.prototype.dispatchAgent = function(task) {
  var cmd = this._buildCliCommand(task);

  return {
    type: 'cli_subprocess',
    command: cmd,
    metadata: {
      agentId: task.agentId,
      model: task.model,
      provider: task.provider,
      effort: task.effort,
      phase: task.phase,
    },
  };
};

/**
 * Dispatch multiple agents in parallel via background subprocesses.
 */
CodexAdapter.prototype.dispatchParallel = function(tasks) {
  var self = this;
  var maxParallel = this.parallel.max; // 3

  var batches = [];
  for (var i = 0; i < tasks.length; i += maxParallel) {
    batches.push(tasks.slice(i, i + maxParallel));
  }

  return {
    type: 'cli_parallel_batch',
    batches: batches.map(function(batch, batchIdx) {
      return {
        batchIndex: batchIdx,
        agents: batch.map(function(task) {
          return {
            agentId: task.agentId,
            command: self._buildCliCommand(task),
            outputFile: 'squad-method/output/.run/' + task.agentId + '-' + task.phase + '.json',
          };
        }),
        syncBarrier: true,
      };
    }),
    totalAgents: tasks.length,
    totalBatches: batches.length,
    shellScript: self._generateParallelScript(tasks),
  };
};

/**
 * Build multi-model dispatch plan.
 */
CodexAdapter.prototype.buildMultiModelPlan = function(agents, phase) {
  return agents.map(function(agentId) {
    var assignment = providers.assignMultiModelAgent('codex', agentId, 'default');
    return {
      agentId: agentId,
      model: assignment.model,
      provider: assignment.provider,
      reason: assignment.reason,
      phase: phase,
    };
  });
};

/**
 * Build CLI command for a single agent.
 */
CodexAdapter.prototype._buildCliCommand = function(task) {
  var parts = ['codex'];

  // Model selection
  parts.push('--model', task.model);

  // Effort (for o-series models)
  if (task.effort && /^o[134]/.test(task.model)) {
    parts.push('--reasoning-effort', task.effort);
  }

  // Output format
  parts.push('--print');

  // The prompt
  parts.push("'" + this._buildAgentPrompt(task).replace(/'/g, "'\\''") + "'");

  return parts.join(' ');
};

/**
 * Generate shell script for parallel Codex CLI dispatch.
 */
CodexAdapter.prototype._generateParallelScript = function(tasks) {
  var self = this;
  var lines = ['#!/bin/bash', 'set -euo pipefail', ''];
  lines.push('# SQUAD Codex Parallel Dispatch — ' + tasks.length + ' agents');
  lines.push('RUN_DIR="squad-method/output/.run"');
  lines.push('mkdir -p "$RUN_DIR"');
  lines.push('PIDS=()');
  lines.push('');

  tasks.forEach(function(task) {
    var cmd = self._buildCliCommand(task);
    lines.push('# Agent: ' + task.agentId + ' → ' + task.model);
    lines.push('(' + cmd + ' > "$RUN_DIR/' + task.agentId + '.json" 2>&1) &');
    lines.push('PIDS+=($!)');
    lines.push('');
  });

  lines.push('# Wait barrier');
  lines.push('FAILURES=0');
  lines.push('for pid in "${PIDS[@]}"; do');
  lines.push('  wait "$pid" || FAILURES=$((FAILURES + 1))');
  lines.push('done');
  lines.push('');
  lines.push('echo "Codex dispatch: ' + tasks.length + ' agents, $FAILURES failures"');

  return lines.join('\n');
};

/**
 * Build prompt for agent.
 */
CodexAdapter.prototype._buildAgentPrompt = function(task) {
  var parts = [];
  parts.push('You are SQUAD agent: ' + task.agentId);
  parts.push('Phase: ' + task.phase);
  parts.push('');
  parts.push('Read persona: ' + task.personaPath);
  parts.push('');
  parts.push(task.taskPrompt);
  if (task.inputs && Object.keys(task.inputs).length > 0) {
    parts.push('');
    parts.push('Prior agent outputs:');
    parts.push(JSON.stringify(task.inputs, null, 2));
  }
  return parts.join('\n');
};

module.exports = CodexAdapter;

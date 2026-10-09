'use strict';

// SQUAD-Public Model Router — decides model tier + effort per agent per phase.
// Generic: no vendor lock-in. Model tiers map to any provider's fast/default/heavy.

var MODELS  = { FAST: 'fast', DEFAULT: 'default', HEAVY: 'heavy' };
var EFFORTS = { LOW: 'low', MED: 'medium', HIGH: 'high', MAX: 'max' };

// Default agent → model overrides (override via config.yaml model_routing.agent_overrides)
var AGENT_MODEL_OVERRIDES = {
  raven:    MODELS.HEAVY,   // adversarial second-order reasoning
  atlas:    MODELS.HEAVY,   // architecture blast radius + threat modelling
  phoenix:  MODELS.HEAVY,   // synthesis — complex multi-agent verdict merging
  scribe:   MODELS.FAST,    // structural pattern matching, no deep reasoning
};

var AGENT_EFFORT_OVERRIDES = {
  raven:    EFFORTS.HIGH,
  atlas:    EFFORTS.HIGH,
  phoenix:  EFFORTS.HIGH,
  scribe:   EFFORTS.LOW,
};

// Phase overrides win over agent defaults
var PHASE_MODEL_OVERRIDES = {
  phase_6: MODELS.FAST,     // commit/PR = structured output, no reasoning needed
};
var PHASE_EFFORT_OVERRIDES = {
  phase_6: EFFORTS.LOW,
};

/**
 * Priority: workspace_mode > phase_override > complexity_upgrade > budget_cap > agent_override > default
 */
function getModel(agentId, phase, ctx) {
  ctx = ctx || {};
  var config = ctx.routing_config || {};

  if (config.mode === 'quality') return MODELS.HEAVY;
  if (config.mode === 'budget')  return MODELS.FAST;

  var phaseMap    = config.phase_overrides || PHASE_MODEL_OVERRIDES;
  var phaseResult = phaseMap[phase];
  if (phaseResult) return phaseResult;

  var blastRadius = +(ctx.blast_radius || 0);
  var upgrade     = config.complexity_upgrade || {};
  var threshold   = upgrade.blast_radius_threshold || 20;
  if (upgrade.enabled !== false && blastRadius > threshold) return MODELS.HEAVY;

  var budget    = config.budget || {};
  var maxHeavy  = budget.max_heavy_agents_per_phase || 3;
  var heavyCount = ctx.heavy_count || 0;
  if (heavyCount >= maxHeavy) return MODELS.DEFAULT;

  var agentMap    = config.agent_overrides || AGENT_MODEL_OVERRIDES;
  var agentResult = agentMap[agentId];
  if (agentResult) return agentResult;

  return config.default || MODELS.DEFAULT;
}

/**
 * Effort level — only meaningful for CLI execution path.
 * IDE-native paths ignore effort; model choice is the only lever there.
 */
function getEffort(agentId, phase, ctx) {
  ctx = ctx || {};
  var config = ctx.routing_config || {};

  if (config.mode === 'quality') return EFFORTS.MAX;
  if (config.mode === 'budget')  return EFFORTS.LOW;

  // Phase override wins before blast_radius — phase_6 (commit/PR) is never reasoning-heavy
  var phaseMap    = config.phase_effort_overrides || PHASE_EFFORT_OVERRIDES;
  var phaseResult = phaseMap[phase];
  if (phaseResult) return phaseResult;

  var blastRadius = +(ctx.blast_radius || 0);
  var upgrade     = config.complexity_upgrade || {};
  var threshold   = upgrade.blast_radius_threshold || 20;
  if (upgrade.enabled !== false && blastRadius > 30) return EFFORTS.MAX;
  if (upgrade.enabled !== false && blastRadius > threshold) return EFFORTS.HIGH;

  var agentMap    = config.agent_effort_overrides || AGENT_EFFORT_OVERRIDES;
  var agentResult = agentMap[agentId];
  if (agentResult) return agentResult;

  return EFFORTS.MED;
}

/**
 * Build the CLI command string for Path B dispatch (any Bash environment with claude CLI).
 * Caller reads the agent persona file and provides taskPrompt.
 */
function buildCliCommand(model, effort, agentPersona, taskPrompt, budgetUsd) {
  var budget      = budgetUsd || 0.05;
  var fallback    = (model === MODELS.HEAVY) ? MODELS.DEFAULT : MODELS.FAST;
  // Bash single-quote safe injection: replace ' with '\''
  var personaPart = (agentPersona || '').replace(/'/g, "'\\''");
  var taskPart    = (taskPrompt   || '').replace(/'/g, "'\\''");
  return 'claude'
    + ' --model '          + model
    + ' --effort '         + effort
    + ' --fallback-model ' + fallback
    + ' --max-budget-usd ' + budget
    + ' --no-session-persistence'
    + ' --output-format text'
    + " --print '" + personaPart + "\n\n" + taskPart + "'";
}

function formatRoutingLog(agentId, phase, model, effort, reason, path) {
  var effortStr = (path === 'cli') ? ' | effort: ' + effort : '';
  return '[Routing] ' + agentId + ' → ' + model + effortStr
    + ' | path: ' + (path || 'native') + ' | reason: ' + (reason || 'default');
}

// ─── Multi-Provider Integration ──────────────────────────────────────────────

var providers = require('./providers.cjs');

/**
 * Resolve full model details for an agent considering IDE + provider.
 * Combines tier routing (above) with concrete model resolution.
 *
 * @param {string} agentId
 * @param {string} phase
 * @param {string} ideId - Active IDE
 * @param {object} [ctx] - Context with blast_radius, routing_config, etc.
 * @returns {{ model: string, provider: string, effort: string, tier: string, reason: string }}
 */
function resolveAgentModel(agentId, phase, ideId, ctx) {
  var tier = getModel(agentId, phase, ctx);
  var effort = getEffort(agentId, phase, ctx);

  // Use multi-model assignment if IDE supports it
  var ideConfig = providers.getIdeProviders(ideId);
  var resolved;
  if (ideConfig.supports_multi_model) {
    resolved = providers.assignMultiModelAgent(ideId, agentId, tier);
  } else {
    resolved = providers.resolveModel(ideId, tier);
    resolved.reason = 'single_model_ide';
  }

  return {
    model: resolved.model,
    provider: resolved.provider,
    effort: effort,
    tier: tier,
    reason: resolved.reason,
    supports_effort: resolved.supports_effort,
    supports_thinking: resolved.supports_thinking,
    max_context: resolved.max_context,
  };
}

/**
 * Build dispatch commands for any IDE — delegates to correct CLI/API format.
 * @param {string} ideId
 * @param {string} agentId
 * @param {string} phase
 * @param {string} taskPrompt
 * @param {object} [ctx]
 * @returns {{ command: string, model: string, provider: string }}
 */
function buildDispatchCommand(ideId, agentId, phase, taskPrompt, ctx) {
  var resolved = resolveAgentModel(agentId, phase, ideId, ctx);

  switch (ideId) {
    case 'claude':
      return {
        command: buildCliCommand(resolved.tier, resolved.effort, '', taskPrompt),
        model: resolved.model,
        provider: resolved.provider,
      };
    case 'codex':
      var effortFlag = resolved.supports_effort ? ' --reasoning-effort ' + resolved.effort : '';
      return {
        command: 'codex --model ' + resolved.model + effortFlag + " --print '" + taskPrompt.replace(/'/g, "'\\''") + "'",
        model: resolved.model,
        provider: resolved.provider,
      };
    case 'kiro':
      return {
        command: 'aws bedrock-runtime invoke-model --model-id "' + resolved.model + '" --region us-east-1',
        model: resolved.model,
        provider: resolved.provider,
      };
    case 'gemini':
      return {
        command: 'curl -s "https://generativelanguage.googleapis.com/v1beta/models/' + resolved.model + ':generateContent"',
        model: resolved.model,
        provider: resolved.provider,
      };
    case 'devin':
      return {
        command: 'curl -s -X POST "https://api.devin.ai/v1/sessions" -H "Authorization: Bearer $DEVIN_API_KEY" -d \'' + JSON.stringify({ model: resolved.model, prompt: taskPrompt }) + '\'',
        model: resolved.model,
        provider: resolved.provider,
      };
    default:
      // Sequential IDEs — no external command, instruction-based
      return {
        command: '# Sequential: ' + agentId + ' → ' + resolved.model,
        model: resolved.model,
        provider: resolved.provider,
      };
  }
}

module.exports = {
  getModel: getModel,
  getEffort: getEffort,
  buildCliCommand: buildCliCommand,
  formatRoutingLog: formatRoutingLog,
  resolveAgentModel: resolveAgentModel,
  buildDispatchCommand: buildDispatchCommand,
  MODELS: MODELS,
  EFFORTS: EFFORTS,
};

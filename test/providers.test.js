/**
 * Tests for Multi-Provider Model Registry and IDE Dispatch
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Load CJS modules under test
const providers = require(join(__dirname, '..', 'squad-method', 'tools', 'router', 'providers.cjs'));
const router = require(join(__dirname, '..', 'squad-method', 'tools', 'router', 'index.cjs'));
const dispatch = require(join(__dirname, '..', 'squad-method', 'tools', 'dispatch', 'index.cjs'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    console.log('  ❌ ' + name);
    console.log('     ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Provider Registry Tests ━━━\n');

test('ANTHROPIC provider has fast/default/heavy models', function() {
  assert.strictEqual(typeof providers.ANTHROPIC.models.fast, 'string');
  assert.strictEqual(typeof providers.ANTHROPIC.models.default, 'string');
  assert.strictEqual(typeof providers.ANTHROPIC.models.heavy, 'string');
  assert.ok(providers.ANTHROPIC.models.heavy.includes('opus'));
});

test('OPENAI provider has fast/default/heavy models', function() {
  assert.strictEqual(providers.OPENAI.models.fast, 'gpt-4o-mini');
  assert.strictEqual(providers.OPENAI.models.default, 'gpt-4o');
  assert.strictEqual(providers.OPENAI.models.heavy, 'o3');
  assert.strictEqual(providers.OPENAI.supports_effort, true);
});

test('GOOGLE provider has fast/default/heavy models', function() {
  assert.ok(providers.GOOGLE.models.fast.includes('flash'));
  assert.ok(providers.GOOGLE.models.default.includes('pro'));
  assert.strictEqual(providers.GOOGLE.max_context, 1000000);
});

test('AMAZON_BEDROCK has Anthropic models via Bedrock', function() {
  assert.ok(providers.AMAZON_BEDROCK.models.fast.includes('anthropic'));
  assert.ok(providers.AMAZON_BEDROCK.models.heavy.includes('opus'));
  assert.ok(providers.AMAZON_BEDROCK.alternatives.fast.includes('titan'));
});

test('AMAZON_Q provider exists', function() {
  assert.strictEqual(providers.AMAZON_Q.id, 'amazon_q');
  assert.strictEqual(providers.AMAZON_Q.models.default, 'amazon-q-developer');
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ IDE Provider Mapping Tests ━━━\n');

test('Claude Code: primary=Anthropic, secondary=[OpenAI, Google]', function() {
  var config = providers.getIdeProviders('claude');
  assert.strictEqual(config.primary.id, 'anthropic');
  assert.strictEqual(config.secondary.length, 2);
  assert.strictEqual(config.supports_parallel, true);
  assert.strictEqual(config.parallel_mechanism, 'agent_tool');
  assert.strictEqual(config.max_parallel, 5);
});

test('Codex: primary=OpenAI, parallel via CLI', function() {
  var config = providers.getIdeProviders('codex');
  assert.strictEqual(config.primary.id, 'openai');
  assert.strictEqual(config.supports_parallel, true);
  assert.strictEqual(config.parallel_mechanism, 'cli_subprocess');
  assert.strictEqual(config.max_parallel, 3);
});

test('Kiro: primary=Bedrock, secondary=[Q, OpenAI, Google, Anthropic]', function() {
  var config = providers.getIdeProviders('kiro');
  assert.strictEqual(config.primary.id, 'amazon_bedrock');
  assert.strictEqual(config.secondary.length, 4);
  assert.strictEqual(config.supports_parallel, true);
  assert.strictEqual(config.parallel_mechanism, 'bedrock_invoke');
  assert.strictEqual(config.supports_multi_model, true);
  // Verify all expected secondary providers
  var secIds = config.secondary.map(function(p) { return p.id; });
  assert.ok(secIds.indexOf('amazon_q') >= 0, 'Kiro should have Amazon Q');
  assert.ok(secIds.indexOf('openai') >= 0, 'Kiro should have OpenAI');
  assert.ok(secIds.indexOf('google') >= 0, 'Kiro should have Google');
  assert.ok(secIds.indexOf('anthropic') >= 0, 'Kiro should have Anthropic');
});

test('Gemini: primary=Google, parallel via Vertex AI', function() {
  var config = providers.getIdeProviders('gemini');
  assert.strictEqual(config.primary.id, 'google');
  assert.strictEqual(config.supports_parallel, true);
  assert.strictEqual(config.parallel_mechanism, 'vertex_ai');
  assert.strictEqual(config.supports_multi_model, true);
});

test('Cursor: multi-model but sequential', function() {
  var config = providers.getIdeProviders('cursor');
  assert.strictEqual(config.primary.id, 'anthropic');
  assert.strictEqual(config.supports_parallel, false);
  assert.strictEqual(config.supports_multi_model, true);
});

test('Windsurf: single model, sequential', function() {
  var config = providers.getIdeProviders('windsurf');
  assert.strictEqual(config.supports_parallel, false);
  assert.strictEqual(config.supports_multi_model, false);
  assert.strictEqual(config.secondary.length, 0);
});

test('Devin: primary=Anthropic, parallel via Devin API', function() {
  var config = providers.getIdeProviders('devin');
  assert.strictEqual(config.primary.id, 'anthropic');
  assert.strictEqual(config.secondary.length, 2);
  assert.strictEqual(config.supports_parallel, true);
  assert.strictEqual(config.parallel_mechanism, 'devin_api');
  assert.strictEqual(config.max_parallel, 3);
  assert.strictEqual(config.supports_multi_model, true);
});

test('Antigravity: multi-model (Anthropic + OpenAI), sequential', function() {
  var config = providers.getIdeProviders('antigravity');
  assert.strictEqual(config.primary.id, 'anthropic');
  assert.strictEqual(config.supports_parallel, false);
  assert.strictEqual(config.supports_multi_model, true);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Model Resolution Tests ━━━\n');

test('resolveModel for Claude returns Anthropic models', function() {
  var result = providers.resolveModel('claude', 'heavy');
  assert.strictEqual(result.provider, 'anthropic');
  assert.ok(result.model.includes('opus'));
});

test('resolveModel for Kiro with openai override returns GPT', function() {
  var result = providers.resolveModel('kiro', 'default', 'openai');
  assert.strictEqual(result.provider, 'openai');
  assert.strictEqual(result.model, 'gpt-4o');
});

test('resolveModel for Kiro with google override returns Gemini', function() {
  var result = providers.resolveModel('kiro', 'fast', 'google');
  assert.strictEqual(result.provider, 'google');
  assert.ok(result.model.includes('flash'));
});

test('resolveModel for Gemini with anthropic override returns Claude', function() {
  var result = providers.resolveModel('gemini', 'heavy', 'anthropic');
  assert.strictEqual(result.provider, 'anthropic');
  assert.ok(result.model.includes('opus'));
});

test('resolveModel fallback for unavailable provider', function() {
  // Windsurf has no Google secondary — should fall back to primary
  var result = providers.resolveModel('windsurf', 'default', 'google');
  assert.strictEqual(result.provider, 'anthropic'); // falls back
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Multi-Model Agent Assignment Tests ━━━\n');

test('Kiro assigns oracle to Google for long-context research', function() {
  var result = providers.assignMultiModelAgent('kiro', 'oracle', 'default');
  assert.strictEqual(result.provider, 'google');
  assert.strictEqual(result.reason, 'research_long_context');
});

test('Kiro assigns sentinel to OpenAI for security reasoning', function() {
  var result = providers.assignMultiModelAgent('kiro', 'sentinel', 'default');
  assert.strictEqual(result.provider, 'openai');
  assert.strictEqual(result.reason, 'security_reasoning');
});

test('Devin assigns oracle to Google for long-context research', function() {
  var result = providers.assignMultiModelAgent('devin', 'oracle', 'default');
  assert.strictEqual(result.provider, 'google');
  assert.strictEqual(result.reason, 'research_long_context');
});

test('Devin assigns sentinel to OpenAI for security reasoning', function() {
  var result = providers.assignMultiModelAgent('devin', 'sentinel', 'default');
  assert.strictEqual(result.provider, 'openai');
  assert.strictEqual(result.reason, 'security_reasoning');
});

test('Kiro assigns raven to primary (Bedrock) for adversarial reasoning', function() {
  var result = providers.assignMultiModelAgent('kiro', 'raven', 'default');
  assert.strictEqual(result.provider, 'amazon_bedrock');
  assert.strictEqual(result.reason, 'adversarial_reasoning');
});

test('Devin assigns oracle to Google for long-context research', function() {
  var result = providers.assignMultiModelAgent('devin', 'oracle', 'default');
  assert.strictEqual(result.provider, 'google');
  assert.strictEqual(result.reason, 'research_long_context');
});

test('Devin assigns sentinel to OpenAI for security reasoning', function() {
  var result = providers.assignMultiModelAgent('devin', 'sentinel', 'default');
  assert.strictEqual(result.provider, 'openai');
  assert.strictEqual(result.reason, 'security_reasoning');
});

test('Windsurf assigns all agents to primary (single model)', function() {
  var result = providers.assignMultiModelAgent('windsurf', 'oracle', 'default');
  assert.strictEqual(result.reason, 'single_model_ide');
});

test('Gemini assigns oracle to Google for research', function() {
  var result = providers.assignMultiModelAgent('gemini', 'oracle', 'default');
  assert.strictEqual(result.provider, 'google');
});

test('Claude assigns sentinel to OpenAI for security', function() {
  var result = providers.assignMultiModelAgent('claude', 'sentinel', 'default');
  assert.strictEqual(result.provider, 'openai');
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Parallel Capability Tests ━━━\n');

test('getParallelCapability returns correct info per IDE', function() {
  var claude = providers.getParallelCapability('claude');
  assert.strictEqual(claude.supported, true);
  assert.strictEqual(claude.mechanism, 'agent_tool');
  assert.strictEqual(claude.max, 5);

  var kiro = providers.getParallelCapability('kiro');
  assert.strictEqual(kiro.supported, true);
  assert.strictEqual(kiro.mechanism, 'bedrock_invoke');
  assert.strictEqual(kiro.max, 3);

  var windsurf = providers.getParallelCapability('windsurf');
  assert.strictEqual(windsurf.supported, false);
  assert.strictEqual(windsurf.max, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Router Multi-Provider Integration Tests ━━━\n');

test('resolveAgentModel for Kiro returns Bedrock model with multi-model', function() {
  var result = router.resolveAgentModel('raven', 'phase_5', 'kiro');
  assert.strictEqual(result.provider, 'amazon_bedrock');
  assert.strictEqual(result.tier, 'heavy'); // raven overrides to heavy
  assert.ok(result.model.includes('opus'));
});

test('resolveAgentModel for Codex returns OpenAI model', function() {
  var result = router.resolveAgentModel('forge', 'phase_3', 'codex');
  assert.strictEqual(result.provider, 'openai');
  assert.strictEqual(result.model, 'gpt-4o'); // forge = default tier
});

test('resolveAgentModel for Windsurf always returns Anthropic', function() {
  var result = router.resolveAgentModel('oracle', 'phase_1', 'windsurf');
  assert.strictEqual(result.provider, 'anthropic');
  assert.strictEqual(result.reason, 'single_model_ide');
});

test('buildDispatchCommand for Kiro returns AWS CLI', function() {
  var result = router.buildDispatchCommand('kiro', 'atlas', 'phase_1', 'analyze arch');
  assert.ok(result.command.includes('aws bedrock-runtime'));
  assert.ok(result.model.includes('anthropic'));
});

test('buildDispatchCommand for Codex returns codex CLI', function() {
  var result = router.buildDispatchCommand('codex', 'forge', 'phase_3', 'implement');
  assert.ok(result.command.includes('codex --model'));
  assert.strictEqual(result.provider, 'openai');
});

test('buildDispatchCommand for Gemini returns curl', function() {
  var result = router.buildDispatchCommand('gemini', 'oracle', 'phase_1', 'research');
  assert.ok(/generativelanguage\.googleapis\.com/.test(result.command));
  assert.strictEqual(result.provider, 'google');
});

test('buildDispatchCommand for Devin returns Devin API call', function() {
  var result = router.buildDispatchCommand('devin', 'atlas', 'phase_1', 'analyze arch');
  assert.ok(result.command.includes('api.devin.ai'));
  assert.ok(result.command.includes('DEVIN_API_KEY'));
  assert.strictEqual(result.provider, 'anthropic');
});

test('buildDispatchCommand for sequential IDEs returns comment', function() {
  var result = router.buildDispatchCommand('windsurf', 'forge', 'phase_3', 'implement');
  assert.ok(result.command.startsWith('# Sequential'));
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Dispatch Orchestrator Tests ━━━\n');

test('getCapabilityMatrix returns all 8 IDEs', function() {
  var matrix = dispatch.getCapabilityMatrix();
  assert.strictEqual(Object.keys(matrix).length, 8);
  assert.ok(matrix.claude);
  assert.ok(matrix.kiro);
  assert.ok(matrix.gemini);
  assert.ok(matrix.codex);
  assert.ok(matrix.cursor);
  assert.ok(matrix.devin);
  assert.ok(matrix.windsurf);
  assert.ok(matrix.antigravity);
});

test('Claude adapter: parallel dispatch batches at max 5', function() {
  var adapter = dispatch.getAdapter('claude');
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, true);
  assert.strictEqual(cap.parallel.max, 5);
  assert.strictEqual(cap.multiModel, true);
});

test('Kiro adapter: parallel dispatch with Bedrock', function() {
  var adapter = dispatch.getAdapter('kiro', { aws_region: 'us-west-2' });
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, true);
  assert.strictEqual(cap.parallel.mechanism, 'bedrock_invoke');
  assert.ok(cap.providers.indexOf('openai') >= 0);
  assert.ok(cap.providers.indexOf('google') >= 0);
  assert.ok(cap.providers.indexOf('amazon_q') >= 0);
});

test('Kiro adapter: buildMultiModelPlan assigns diverse providers', function() {
  var adapter = dispatch.getAdapter('kiro');
  var plan = adapter.buildMultiModelPlan(['oracle', 'raven', 'sentinel', 'scribe'], 'phase_5');
  // oracle → google (research), raven → primary (bedrock), sentinel → openai, scribe → fast
  var oracleAssignment = plan.find(function(p) { return p.agentId === 'oracle'; });
  var sentinelAssignment = plan.find(function(p) { return p.agentId === 'sentinel'; });
  assert.strictEqual(oracleAssignment.provider, 'google');
  assert.strictEqual(sentinelAssignment.provider, 'openai');
});

test('Devin adapter: parallel dispatch with multi-model', function() {
  var adapter = dispatch.getAdapter('devin');
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, true);
  assert.strictEqual(cap.parallel.mechanism, 'devin_api');
  assert.strictEqual(cap.parallel.max, 3);
  assert.strictEqual(cap.multiModel, true);
  assert.ok(cap.providers.indexOf('anthropic') >= 0);
  assert.ok(cap.providers.indexOf('openai') >= 0);
  assert.ok(cap.providers.indexOf('google') >= 0);
});

test('Devin adapter: buildMultiModelPlan assigns diverse providers', function() {
  var adapter = dispatch.getAdapter('devin');
  var plan = adapter.buildMultiModelPlan(['oracle', 'raven', 'sentinel', 'scribe'], 'phase_5');
  var oracleAssignment = plan.find(function(p) { return p.agentId === 'oracle'; });
  var sentinelAssignment = plan.find(function(p) { return p.agentId === 'sentinel'; });
  assert.strictEqual(oracleAssignment.provider, 'google');
  assert.strictEqual(sentinelAssignment.provider, 'openai');
});

test('Gemini adapter: parallel dispatch via Vertex AI', function() {
  var adapter = dispatch.getAdapter('gemini', { gcp_project: 'my-project' });
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, true);
  assert.strictEqual(cap.parallel.mechanism, 'vertex_ai');
});

test('Devin adapter: parallel dispatch with multi-model', function() {
  var adapter = dispatch.getAdapter('devin');
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, true);
  assert.strictEqual(cap.parallel.mechanism, 'devin_api');
  assert.strictEqual(cap.parallel.max, 3);
  assert.strictEqual(cap.multiModel, true);
  assert.ok(cap.providers.indexOf('anthropic') >= 0);
  assert.ok(cap.providers.indexOf('openai') >= 0);
  assert.ok(cap.providers.indexOf('google') >= 0);
});

test('Devin adapter: buildMultiModelPlan assigns diverse providers', function() {
  var adapter = dispatch.getAdapter('devin');
  var plan = adapter.buildMultiModelPlan(['oracle', 'raven', 'sentinel', 'scribe'], 'phase_5');
  var oracleAssignment = plan.find(function(p) { return p.agentId === 'oracle'; });
  var sentinelAssignment = plan.find(function(p) { return p.agentId === 'sentinel'; });
  assert.strictEqual(oracleAssignment.provider, 'google');
  assert.strictEqual(sentinelAssignment.provider, 'openai');
});

test('Windsurf adapter: sequential only, single model', function() {
  var adapter = dispatch.getAdapter('windsurf');
  var cap = adapter.detectCapability();
  assert.strictEqual(cap.parallel.supported, false);
  assert.strictEqual(cap.multiModel, false);
});

test('createPlan for Kiro generates parallel batch with multi-model', function() {
  var plan = dispatch.createPlan('kiro', ['raven', 'atlas', 'oracle'], 'phase_5', {
    taskPrompt: 'Review code changes',
    ideConfig: { aws_region: 'us-east-1' },
  });
  assert.strictEqual(plan.ide, 'kiro');
  assert.strictEqual(plan.type, 'bedrock_parallel_batch');
  assert.strictEqual(plan.multiModel, true);
  assert.strictEqual(plan.totalAgents, 3);
  // Check diverse model assignments
  var assignments = plan.modelAssignments;
  var providers_used = assignments.map(function(a) { return a.provider; });
  assert.ok(providers_used.length === 3); // all agents get assigned
});

test('createPlan for Devin generates parallel batch with multi-model', function() {
  var plan = dispatch.createPlan('devin', ['raven', 'atlas', 'oracle'], 'phase_5', {
    taskPrompt: 'Review code changes',
  });
  assert.strictEqual(plan.ide, 'devin');
  assert.strictEqual(plan.type, 'devin_parallel_batch');
  assert.strictEqual(plan.multiModel, true);
  assert.strictEqual(plan.totalAgents, 3);
  assert.strictEqual(plan.totalBatches, 1);
});

test('createPlan for Windsurf generates sequential simulation', function() {
  var plan = dispatch.createPlan('windsurf', ['raven', 'atlas'], 'phase_5', {
    taskPrompt: 'Review code',
  });
  assert.strictEqual(plan.ide, 'windsurf');
  assert.strictEqual(plan.type, 'sequential_simulation');
  assert.strictEqual(plan.multiModel, false);
});

test('createPlan for Claude generates parallel agent tool batch', function() {
  var plan = dispatch.createPlan('claude', ['raven', 'atlas', 'forge', 'cipher', 'sentinel'], 'phase_5', {
    taskPrompt: 'Multi-agent review',
  });
  assert.strictEqual(plan.type, 'parallel_agent_tool_batch');
  assert.strictEqual(plan.totalAgents, 5);
  assert.strictEqual(plan.totalBatches, 1); // 5 agents ≤ max 5
});

test('createPlan for Claude with 7 agents creates 2 batches', function() {
  var plan = dispatch.createPlan('claude', ['raven', 'atlas', 'forge', 'cipher', 'sentinel', 'scribe', 'phoenix'], 'phase_5', {
    taskPrompt: 'Full review',
  });
  assert.strictEqual(plan.totalAgents, 7);
  assert.strictEqual(plan.totalBatches, 2); // 5 + 2
});

test('generateScript returns shell script for parallel IDEs', function() {
  var plan = dispatch.createPlan('kiro', ['raven', 'atlas'], 'phase_5', {
    taskPrompt: 'test',
    ideConfig: { aws_region: 'us-east-1' },
  });
  var script = dispatch.generateScript(plan);
  assert.ok(script.includes('#!/bin/bash'));
  assert.ok(script.includes('PIDS'));
  assert.ok(script.includes('wait'));
});

test('generateScript returns comment for sequential IDEs', function() {
  var plan = dispatch.createPlan('windsurf', ['raven'], 'phase_1', { taskPrompt: 'test' });
  var script = dispatch.generateScript(plan);
  assert.ok(script.includes('Sequential'));
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ IDE Hook Generation Tests ━━━\n');

test('Claude adapter generates settings.json hooks', function() {
  var adapter = dispatch.getAdapter('claude');
  var hooks = adapter.generateHooksConfig();
  assert.ok(hooks.hooks.PreToolUse);
  assert.ok(hooks.hooks.PostToolUse);
  assert.ok(hooks.hooks.UserPromptSubmit);
  assert.ok(hooks.hooks.Stop);
  assert.ok(hooks.hooks.UserPromptSubmit[0].hooks[0].command.includes('SQUAD Reminder'));
});

test('Kiro adapter generates parallel script with AWS commands', function() {
  var adapter = dispatch.getAdapter('kiro', { aws_region: 'eu-west-1' });
  var tasks = [
    { agentId: 'raven', model: 'us.anthropic.claude-sonnet-4-20250514-v1:0', provider: 'amazon_bedrock', phase: 'phase_5', personaPath: 'agents/raven.md', taskPrompt: 'review', inputs: {}, effort: 'high' },
    { agentId: 'oracle', model: 'gemini-2.5-pro', provider: 'google', phase: 'phase_5', personaPath: 'agents/oracle.md', taskPrompt: 'research', inputs: {}, effort: 'medium' },
  ];
  var result = adapter.dispatchParallel(tasks);
  assert.strictEqual(result.type, 'bedrock_parallel_batch');
  assert.ok(result.shellScript.includes('#!/bin/bash'));
  assert.ok(result.shellScript.includes('PIDS'));
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ All Provider Available Tests ━━━\n');

test('getAvailableProviders for Kiro returns 5 providers', function() {
  var avail = providers.getAvailableProviders('kiro');
  assert.strictEqual(avail.length, 5);
  assert.ok(avail.indexOf('amazon_bedrock') >= 0);
  assert.ok(avail.indexOf('amazon_q') >= 0);
  assert.ok(avail.indexOf('openai') >= 0);
  assert.ok(avail.indexOf('google') >= 0);
  assert.ok(avail.indexOf('anthropic') >= 0);
});

test('getAvailableProviders for Claude returns 3 providers', function() {
  var avail = providers.getAvailableProviders('claude');
  assert.strictEqual(avail.length, 3);
  assert.ok(avail.indexOf('anthropic') >= 0);
  assert.ok(avail.indexOf('openai') >= 0);
  assert.ok(avail.indexOf('google') >= 0);
});

test('getAvailableProviders for Devin returns 3 providers', function() {
  var avail = providers.getAvailableProviders('devin');
  assert.strictEqual(avail.length, 3);
  assert.ok(avail.indexOf('anthropic') >= 0);
  assert.ok(avail.indexOf('openai') >= 0);
  assert.ok(avail.indexOf('google') >= 0);
});

test('getAvailableProviders for Windsurf returns 1 provider', function() {
  var avail = providers.getAvailableProviders('windsurf');
  assert.strictEqual(avail.length, 1);
  assert.strictEqual(avail[0], 'anthropic');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(failed > 0 ? 1 : 0);

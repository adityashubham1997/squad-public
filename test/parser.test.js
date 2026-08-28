import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import parser from '../squad-method/tools/parser/prompt-parser.cjs';

const { parseLlmJsonResponse } = parser;

describe('parseLlmJsonResponse', () => {
  it('parses valid JSON', () => {
    const jsonStr = JSON.stringify({
      requirements: [{
        raw_text_quote: "test",
        fragment_type: "actionable",
        interpreted_action: "do test"
      }]
    });
    const parsed = parseLlmJsonResponse(jsonStr);
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].fragment_type, 'actionable');
  });

  it('strips markdown json fences', () => {
    const rawJson = JSON.stringify({
      requirements: [{
        raw_text_quote: "test",
        fragment_type: "uninterpreted",
        interpreted_action: "do test"
      }]
    });
    const jsonStr = `\`\`\`json\n${rawJson}\n\`\`\``;
    const parsed = parseLlmJsonResponse(jsonStr);
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].fragment_type, 'uninterpreted');
  });

  it('strips plain markdown fences', () => {
    const rawJson = JSON.stringify({
      requirements: [{
        raw_text_quote: "test",
        fragment_type: "junk",
        interpreted_action: "ignore"
      }]
    });
    const jsonStr = `\`\`\`\n${rawJson}\n\`\`\``;
    const parsed = parseLlmJsonResponse(jsonStr);
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].fragment_type, 'junk');
  });

  it('fixes trailing commas', () => {
    const jsonStr = `{
      "requirements": [
        {
          "raw_text_quote": "test",
          "fragment_type": "actionable",
          "interpreted_action": "do test"
        },
      ]
    }`;
    const parsed = parseLlmJsonResponse(jsonStr);
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].fragment_type, 'actionable');
  });

  it('yields graceful uninterpreted block if completely broken', () => {
    const jsonStr = `Here is your JSON: { broken }`;
    const parsed = parseLlmJsonResponse(jsonStr);
    assert.equal(parsed.requirements.length, 1);
    assert.equal(parsed.requirements[0].fragment_type, 'uninterpreted');
    assert.equal(parsed.requirements[0].raw_text_quote, 'Error parsing LLM response');
  });

  it('fails if strict schema validation fails', () => {
    const invalidJsonStr = JSON.stringify({
      requirements: [{
        raw_text_quote: "test",
        fragment_type: "invalid_bucket", // must be actionable, uninterpreted, or junk
        interpreted_action: "do test"
      }]
    });
    const parsed = parseLlmJsonResponse(invalidJsonStr);
    // Auto-fix catches schema error and returns the fallback block
    assert.equal(parsed.requirements[0].fragment_type, 'uninterpreted');
    assert.equal(parsed.requirements[0].raw_text_quote, 'Error parsing LLM response');
  });
});

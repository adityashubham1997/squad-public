const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, 'schemas', 'requirement-v1.json');

function buildParserPrompt(rawPrompt) {
  let schema = '{}';
  if (fs.existsSync(SCHEMA_PATH)) {
    schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  }

  const prevReqs = process.env.PREV_REQS || '';
  let mergeContext = '';
  
  if (prevReqs.trim().length > 0) {
    mergeContext = `
PREVIOUS UNFINISHED REQUIREMENTS:
The user previously aborted an execution, leaving these requirements unfinished:
${prevReqs}

MERGE INSTRUCTION:
You must merge the PREVIOUS UNFINISHED REQUIREMENTS with the NEW USER PROMPT. 
If the new prompt overrides or cancels a previous requirement, drop the old one. 
Otherwise, include BOTH the old requirements and the new requirements in your final JSON output.
`;
  }

  return `
You are the SQUAD-Public Requirement Parser.
Your job is to read the user prompt (and any previous unfinished requirements) and extract a unified list of requirements matching the following JSON schema:
${schema}
${mergeContext}
Taxonomy Rules:
- If a fragment is a specific technical action, mark it "actionable".
- If it is a valid request but too vague or ambiguous, mark it "uninterpreted".
- If a fragment is pure conversational noise (e.g., "Hello", "How are you", "Thanks"), mark it "junk".

**CRITICAL**: Every single fragment of the user prompt must be categorized into one of these 3 buckets. Do not skip any text.

Output strictly valid JSON and nothing else.

USER PROMPT:
${rawPrompt}
  `.trim();
}

/**
 * Validates that the parsed JSON strictly follows the requirement-v1.json schema
 * Zero-dependency implementation.
 */
function validateRequirementsSchema(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error("Root must be a JSON object");
  }
  if (!Array.isArray(data.requirements)) {
    throw new Error("Missing 'requirements' array");
  }

  const validFragmentTypes = ['actionable', 'uninterpreted', 'junk'];

  for (let i = 0; i < data.requirements.length; i++) {
    const req = data.requirements[i];
    if (!req || typeof req !== 'object') {
      throw new Error(`Requirement at index ${i} must be an object`);
    }
    if (typeof req.raw_text_quote !== 'string') {
      throw new Error(`Requirement at index ${i} is missing string 'raw_text_quote'`);
    }
    if (typeof req.fragment_type !== 'string' || !validFragmentTypes.includes(req.fragment_type)) {
      throw new Error(`Requirement at index ${i} has invalid 'fragment_type'. Must be one of: ${validFragmentTypes.join(', ')}`);
    }
    if (typeof req.interpreted_action !== 'string') {
      throw new Error(`Requirement at index ${i} is missing string 'interpreted_action'`);
    }
  }
  
  return true;
}

/**
 * Robust JSON parsing with auto-fix and schema validation
 */
function parseLlmJsonResponse(jsonStr, useLlmFix = true) {
  try {
    // Attempt standard parse first
    const parsed = JSON.parse(jsonStr.trim());
    validateRequirementsSchema(parsed);
    return parsed;
  } catch (err) {
    if (!useLlmFix) {
      throw new Error("JSON parse failed: " + err.message);
    }
    
    console.warn("[PromptParser] JSON malformed. Attempting auto-fix...");
    // Auto-fix heuristics
    let fixed = jsonStr.trim();
    
    // Strip markdown code blocks
    if (fixed.startsWith('\`\`\`json')) {
      fixed = fixed.substring(7);
    }
    if (fixed.startsWith('\`\`\`')) {
      fixed = fixed.substring(3);
    }
    if (fixed.endsWith('\`\`\`')) {
      fixed = fixed.substring(0, fixed.length - 3);
    }
    
    // Fix trailing commas
    fixed = fixed.replace(/,\s*([\]}])/g, '$1');
    
    try {
      const fixedParsed = JSON.parse(fixed.trim());
      validateRequirementsSchema(fixedParsed);
      return fixedParsed;
    } catch (err2) {
      // If auto-fix fails, we return an uninterpreted block so the queue yields gracefully
      return {
        requirements: [{
          raw_text_quote: "Error parsing LLM response",
          fragment_type: "uninterpreted",
          interpreted_action: "The AI failed to format the requirements properly."
        }]
      };
    }
  }
}

function extractRequirements(filteredPrompt) {
  const taskPrompt = buildParserPrompt(filteredPrompt);
  
  // Using SQUAD-Public's convention of calling the CLI. 
  // In a real SQUAD env, this routes via index.cjs buildCliCommand
  // For the parser, we use a fast model (e.g., claude-3-haiku)
  
  // Mock LLM call mechanism for SQUAD-Public CLI
  const taskPart = taskPrompt.replace(/\r/g, '').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/`/g, '\\`');
  const cmd = `claude --model fast --output-format text --print "${taskPart}"`;
  
  try {
    // Execute LLM with increased 10MB buffer to prevent ENOBUFS
    const output = execSync(cmd, { 
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024 * 10 
    });
    const parsed = parseLlmJsonResponse(output, true);
    return parsed;
  } catch (error) {
    console.warn("[PromptParser] LLM execution failed or claude CLI not found. Returning uninterpreted requirement.");
    return {
      requirements: [{
        raw_text_quote: filteredPrompt,
        fragment_type: "uninterpreted",
        interpreted_action: "Could not reach LLM to parse this prompt."
      }]
    };
  }
}

// CLI usage
if (require.main === module) {
  let prompt = '';
  if (process.argv.length > 2) {
    prompt = process.argv.slice(2).join(' ');
    console.log(JSON.stringify(extractRequirements(prompt), null, 2));
  } else {
    const stdin = process.stdin;
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => prompt += chunk);
    stdin.on('end', () => {
      console.log(JSON.stringify(extractRequirements(prompt.trim()), null, 2));
    });
  }
}

module.exports = { extractRequirements, parseLlmJsonResponse };

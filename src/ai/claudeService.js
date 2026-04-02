import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import { SYSTEM_PROMPT, FEW_SHOT_EXAMPLES, buildContextPrompt, buildUserMessage } from './prompts.js';

let anthropicClient = null;

/**
 * Initialize Anthropic client
 */
function getClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

/**
 * Check if AI is enabled
 */
export function isAIEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here';
}

/**
 * Parse natural language expense command using Claude AI
 *
 * @param {string} userInput - Raw user message (after @expense removed)
 * @param {string} senderName - Name of the sender
 * @param {object} groupContext - Current group state
 * @param {Array} conversationHistory - Recent conversation messages (optional)
 * @returns {Promise<object>} Structured response from AI
 */
export async function parseExpenseIntent(userInput, senderName, groupContext, conversationHistory = []) {
  const client = getClient();

  if (!client) {
    logger.warn('Anthropic API key not configured, falling back to rule-based parsing');
    return null; // Fall back to rule-based
  }

  try {
    const contextPrompt = buildContextPrompt(groupContext);
    const userMessage = buildUserMessage(
      userInput,
      senderName,
      groupContext.members || []
    );

    // Build messages array with conversation history
    const messages = [
      ...FEW_SHOT_EXAMPLES,
      ...conversationHistory, // Include recent conversation for context
      {
        role: 'user',
        content: `${contextPrompt}\n\n${userMessage}`
      }
    ];

    logger.info({ historyLength: conversationHistory.length }, 'Calling Claude API for intent parsing with conversation history');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0.3, // Lower temperature for more consistent JSON
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const rawResponse = response.content[0].text;
    logger.debug({ rawResponse }, 'Claude AI response');

    // Parse JSON response
    let parsed;

    try {
      // First try: parse as-is
      parsed = JSON.parse(rawResponse);
    } catch (parseError) {
      // Second try: extract from markdown code block
      const jsonMatch = rawResponse.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (innerError) {
          logger.error({ innerError, extractedJson: jsonMatch[1] }, 'Failed to parse extracted JSON');
          return null;
        }
      } else {
        logger.error({ parseError, rawResponse: rawResponse.substring(0, 200) }, 'Failed to parse AI JSON response');
        return null;
      }
    }

    // Validate required fields
    if (!parsed || !parsed.action || !parsed.message) {
      logger.warn('Invalid AI response structure, falling back');
      return null;
    }

    return parsed;

  } catch (error) {
    logger.error({ error }, 'Error calling Claude API');

    // Handle rate limits
    if (error.status === 429) {
      logger.warn('Claude API rate limit hit, falling back to rule-based');
    }

    return null;
  }
}

/**
 * Generate natural language response for an action
 *
 * @param {string} action - The action type
 * @param {object} data - Action data
 * @param {object} groupContext - Current group state
 * @returns {Promise<string>} Natural language response
 */
export async function generateResponse(action, data, groupContext) {
  const client = getClient();

  if (!client) {
    return null; // Fall back to template responses
  }

  try {
    const contextPrompt = buildContextPrompt(groupContext);

    const prompt = `${contextPrompt}

### Action Completed:
Action: ${action}
Data: ${JSON.stringify(data, null, 2)}

Generate a concise, friendly WhatsApp-style response confirming this action.
Include relevant balance updates if applicable.
Keep it under 5 lines.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      temperature: 0.7,
      system: 'You are a friendly WhatsApp expense bot. Generate concise, emoji-enhanced responses.',
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;

  } catch (error) {
    logger.error({ error }, 'Error generating AI response');
    return null;
  }
}

/**
 * Intelligent name normalization using AI
 *
 * @param {string} mentionedName - Name mentioned by user
 * @param {array} availableNames - List of actual group member names
 * @returns {Promise<string|null>} Matched name or null
 */
export async function matchUserName(mentionedName, availableNames) {
  const client = getClient();

  if (!client || availableNames.length === 0) {
    return null;
  }

  try {
    const prompt = `Match the mentioned name to an actual group member:

Mentioned: "${mentionedName}"

Available members:
${availableNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Rules:
- Match nicknames to full names (e.g., "Sam" → "Samuel")
- Handle typos and variations
- Be case-insensitive
- If no clear match, return null

Respond with ONLY the matched name or the word "null" (no quotes, no explanation).`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5', // Faster model for simple tasks
      max_tokens: 50,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });

    const match = response.content[0].text.trim();

    if (match.toLowerCase() === 'null' || !availableNames.includes(match)) {
      return null;
    }

    return match;

  } catch (error) {
    logger.error({ error }, 'Error matching user name with AI');
    return null;
  }
}

export default {
  isAIEnabled,
  parseExpenseIntent,
  generateResponse,
  matchUserName
};

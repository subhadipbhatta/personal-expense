/**
 * Conversation Memory Manager
 * Maintains conversation history per group for context-aware AI responses
 */

import logger from '../utils/logger.js';

// In-memory conversation store: groupId -> array of messages
const conversationStore = new Map();

// Maximum messages to keep per group (last N messages)
const MAX_HISTORY_LENGTH = 10;

// Time to keep conversation history (30 minutes)
const HISTORY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Add a user message to conversation history
 * @param {string} groupId - WhatsApp group ID
 * @param {string} senderName - Name of the user who sent the message
 * @param {string} message - User's message text
 */
export function addUserMessage(groupId, senderName, message) {
  if (!conversationStore.has(groupId)) {
    conversationStore.set(groupId, []);
  }

  const history = conversationStore.get(groupId);

  history.push({
    role: 'user',
    content: `**${senderName}:** ${message}`,
    timestamp: Date.now()
  });

  // Trim to max length
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  logger.debug({ groupId, historyLength: history.length }, 'Added user message to conversation history');
}

/**
 * Add an AI response to conversation history
 * @param {string} groupId - WhatsApp group ID
 * @param {string} message - AI's response message
 */
export function addAIMessage(groupId, message) {
  if (!conversationStore.has(groupId)) {
    conversationStore.set(groupId, []);
  }

  const history = conversationStore.get(groupId);

  history.push({
    role: 'assistant',
    content: message,
    timestamp: Date.now()
  });

  // Trim to max length
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  logger.debug({ groupId, historyLength: history.length }, 'Added AI message to conversation history');
}

/**
 * Get conversation history for a group
 * @param {string} groupId - WhatsApp group ID
 * @returns {Array} Array of message objects with role and content
 */
export function getConversationHistory(groupId) {
  const history = conversationStore.get(groupId) || [];

  // Filter out messages older than timeout
  const now = Date.now();
  const recentHistory = history.filter(msg => (now - msg.timestamp) < HISTORY_TIMEOUT_MS);

  // Update store with filtered history
  if (recentHistory.length !== history.length) {
    conversationStore.set(groupId, recentHistory);
    logger.debug({ groupId, removed: history.length - recentHistory.length }, 'Cleaned up old conversation history');
  }

  return recentHistory.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

/**
 * Clear conversation history for a group
 * @param {string} groupId - WhatsApp group ID
 */
export function clearConversationHistory(groupId) {
  conversationStore.delete(groupId);
  logger.info({ groupId }, 'Cleared conversation history');
}

/**
 * Get conversation history as formatted text for context
 * @param {string} groupId - WhatsApp group ID
 * @returns {string} Formatted conversation history
 */
export function getFormattedHistory(groupId) {
  const history = getConversationHistory(groupId);

  if (history.length === 0) {
    return '';
  }

  return `\n\n### Recent Conversation (last ${history.length} messages):\n` +
    history.map(msg => {
      const prefix = msg.role === 'user' ? '👤' : '🤖';
      return `${prefix} ${msg.content}`;
    }).join('\n');
}

export default {
  addUserMessage,
  addAIMessage,
  getConversationHistory,
  clearConversationHistory,
  getFormattedHistory
};

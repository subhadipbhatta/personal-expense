/**
 * Conversational AI Handler with Splitwise Integration
 * Enhanced AI message handling for natural conversations and expense management
 */

import logger from '../utils/logger.js';
import { parseExpenseIntent } from '../ai/claudeService.js';
import { buildGroupContext, getSenderName } from '../ai/contextBuilder.js';
import { getSplitwiseHandler } from '../modules/splitwise/handler.js';
import { sendMessage } from './messageHandler.js';
import { getUserInfo } from '../utils/userHelpers.js';
import { findUserByMention } from '../utils/userMatcher.js';
import {
  addUserMessage,
  addAIMessage,
  getConversationHistory
} from '../ai/conversationMemory.js';

const TRIGGER = process.env.BOT_TRIGGER || '@anukul';

/**
 * Handle message with conversational AI + Splitwise
 */
export async function handleConversationalAI(sock, message) {
  const messageText = extractMessageText(message);
  if (!messageText) return false;

  // Check if message is for this bot
  if (!messageText.toLowerCase().includes(TRIGGER.toLowerCase())) {
    return false;
  }

  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;
  const isGroup = groupId.endsWith('@g.us');

  // Only work in groups
  if (!isGroup) {
    await sendMessage(sock, groupId, '❌ I only work in WhatsApp groups. Add me to a group to get started!');
    return true;
  }

  try {
    // Remove trigger and get user input
    const userInput = messageText.replace(new RegExp(TRIGGER, 'gi'), '').trim();

    if (!userInput) {
      await sendMessage(sock, groupId, '👋 Hey! How can I help you? Try asking me something or say "help"!');
      return true;
    }

    // Get group metadata and build context
    const groupMetadata = await sock.groupMetadata(groupId);
    const senderName = await getSenderName(sock, groupMetadata, senderId);
    const groupContext = await buildGroupContextWithSplitwise(sock, groupId, groupMetadata);

    // Add user message to conversation history
    addUserMessage(groupId, senderName, userInput);

    // Get recent conversation history for context
    const conversationHistory = getConversationHistory(groupId);

    logger.info({ userInput, senderName, groupId, historyLength: conversationHistory.length }, 'Processing conversational AI request');

    // Use Claude AI to understand intent with conversation history
    const aiResponse = await parseExpenseIntent(userInput, senderName, groupContext, conversationHistory);

    if (!aiResponse || aiResponse.confidence < 0.5) {
      logger.warn('AI confidence too low or no response');
      const fallbackMessage = `🤔 I'm not quite sure what you mean. Could you rephrase that?

Try:
• "@anukul add expense $50 dinner"
• "@anukul show balances"
• "@anukul what can you do?"`;

      // Add fallback message to conversation history
      addAIMessage(groupId, fallbackMessage);

      await sendMessage(sock, groupId, fallbackMessage);
      return true;
    }

    logger.info({ action: aiResponse.action, confidence: aiResponse.confidence }, 'AI parsed intent');

    // Add AI's message to conversation history (for context in next message)
    if (aiResponse.message) {
      addAIMessage(groupId, aiResponse.message);
    }

    // Handle the AI response
    await handleAIAction(sock, message, aiResponse, groupContext, senderName, groupMetadata);
    return true;

  } catch (error) {
    logger.error({ error }, 'Error in conversational AI handler');
    await sendMessage(sock, groupId, '❌ Oops! Something went wrong. Please try again.');
    return true;
  }
}

/**
 * Build group context with Splitwise data
 */
async function buildGroupContextWithSplitwise(sock, groupId, groupMetadata) {
  const splitwiseHandler = getSplitwiseHandler();

  try {
    // Get Splitwise group ID if mapped
    const { getSplitwiseMapper } = await import('../modules/splitwise/mapper.js');
    const mapper = getSplitwiseMapper();
    const groupMapping = await mapper.getGroupMapping(groupId);

    let expenses = [];
    let balances = [];
    let splitwiseGroupId = null;

    if (groupMapping) {
      splitwiseGroupId = groupMapping.splitwiseGroupId;

      // Fetch recent expenses and balances from Splitwise
      expenses = await splitwiseHandler.getGroupExpenses(sock, groupId, groupMetadata, 10);
      balances = await splitwiseHandler.getGroupBalances(sock, groupId, groupMetadata);
    }

    // Get group members
    const members = groupMetadata.participants.map(p => {
      const name = p.notify || p.name || p.id.split('@')[0];
      return name;
    });

    return {
      groupName: groupMetadata.subject,
      splitwiseGroupId,
      members,
      expenses: expenses.map(e => ({
        cost: parseFloat(e.cost),
        description: e.description,
        paidBy: e.users?.find(u => parseFloat(u.paid_share) > 0)?.user?.first_name || 'Unknown',
        date: e.date
      })),
      balances,
    };
  } catch (error) {
    logger.error({ error }, 'Error building Splitwise context');
    return { groupName: groupMetadata.subject, members: [], expenses: [], balances: [] };
  }
}

/**
 * Handle different AI action types
 */
async function handleAIAction(sock, message, aiResponse, groupContext, senderName, groupMetadata) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;

  // Handle clarification requests
  if (aiResponse.needs_clarification) {
    await sendMessage(sock, groupId, aiResponse.message);
    if (aiResponse.suggestions && aiResponse.suggestions.length > 0) {
      const suggestions = aiResponse.suggestions.map(s => `• ${s}`).join('\n');
      await sendMessage(sock, groupId, `\n💡 *Suggestions:*\n${suggestions}`);
    }
    return;
  }

  switch (aiResponse.action) {
    case 'conversation':
      // Pure conversational response
      await sendMessage(sock, groupId, aiResponse.message);
      if (aiResponse.suggestions && aiResponse.suggestions.length > 0) {
        const suggestions = aiResponse.suggestions.slice(0, 3).map(s => `• ${s}`).join('\n');
        await sendMessage(sock, groupId, `\n💡 *You can try:*\n${suggestions}`);
      }
      break;

    case 'help':
      await sendHelpMessage(sock, groupId);
      break;

    case 'add_expense':
      await handleAIExpenseWithSplitwise(sock, message, aiResponse, senderName, groupMetadata);
      break;

    case 'settle':
      await handleAISettleWithSplitwise(sock, message, aiResponse, senderName, groupMetadata);
      break;

    case 'balance':
      await handleBalanceWithSplitwise(sock, groupId, groupMetadata);
      break;

    case 'analyze_spending':
      await handleSpendingAnalysis(sock, groupId, aiResponse, groupContext);
      break;

    case 'check_splitwise':
    case 'test_connection':
      await handleCheckSplitwiseConnection(sock, groupId);
      break;

    default:
      logger.warn({ action: aiResponse.action }, 'Unknown AI action type');
      await sendMessage(sock, groupId, aiResponse.message || '🤔 Not sure how to handle that. Try asking me something else!');
  }
}

/**
 * Handle expense addition with Splitwise
 */
async function handleAIExpenseWithSplitwise(sock, message, aiResponse, senderName, groupMetadata) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;
  const extracted = aiResponse.extracted_data;

  try {
    const splitwiseHandler = getSplitwiseHandler();

    // Determine payer
    let payerId = senderId;
    if (extracted.payer && extracted.payer !== 'sender') {
      const payerUser = findUserByMention(extracted.payer, groupMetadata);
      if (payerUser) {
        payerId = payerUser.id;
      }
    }

    // Determine participants
    let participantIds = [];
    if (extracted.participants && extracted.participants.length > 0) {
      for (const participant of extracted.participants) {
        if (participant === 'sender') {
          participantIds.push(senderId);
        } else {
          const user = findUserByMention(participant, groupMetadata);
          if (user) {
            participantIds.push(user.id);
          }
        }
      }
    }

    // If no participants specified, just the payer
    if (participantIds.length === 0) {
      participantIds = [payerId];
    }

    // Make sure payer is included
    if (!participantIds.includes(payerId)) {
      participantIds.unshift(payerId);
    }

    // Add expense to Splitwise
    const expense = await splitwiseHandler.addExpense(sock, groupId, groupMetadata, {
      amount: extracted.amount,
      description: extracted.description || 'Expense',
      payerId,
      splitAmongIds: participantIds,
    });

    // Send confirmation (use AI's message if conversational, otherwise structured)
    if (aiResponse.is_conversational) {
      await sendMessage(sock, groupId, aiResponse.message);
    } else {
      const payerInfo = await getUserInfo(sock, groupMetadata, payerId);
      const splitAmount = extracted.amount / participantIds.length;

      await sendMessage(sock, groupId,
        `✅ Expense added to Splitwise!\n\n` +
        `💵 Amount: $${extracted.amount.toFixed(2)}\n` +
        `📝 ${extracted.description || 'Expense'}\n` +
        `👤 Paid by: ${payerInfo.userName}\n` +
        `👥 Split among: ${participantIds.length} ${participantIds.length === 1 ? 'person' : 'people'}\n` +
        `💰 Each owes: $${splitAmount.toFixed(2)}`
      );
    }

    logger.info({ expenseId: expense.id, groupId }, 'Expense added via conversational AI');

  } catch (error) {
    logger.error({ error }, 'Error adding expense via AI');
    await sendMessage(sock, groupId, '❌ Failed to add expense. Please try again or check your Splitwise connection.');
  }
}

/**
 * Handle settlement with Splitwise
 */
async function handleAISettleWithSplitwise(sock, message, aiResponse, senderName, groupMetadata) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;
  const extracted = aiResponse.extracted_data;

  try {
    const splitwiseHandler = getSplitwiseHandler();

    // Find the recipient
    const toUser = findUserByMention(extracted.settle_to, groupMetadata);
    if (!toUser) {
      await sendMessage(sock, groupId, `❌ Could not find user: ${extracted.settle_to}\n\nPlease check the name and try again.`);
      return;
    }

    const toInfo = await getUserInfo(sock, groupMetadata, toUser.id);
    const fromInfo = await getUserInfo(sock, groupMetadata, senderId);

    // Record payment in Splitwise
    await splitwiseHandler.addExpense(sock, groupId, groupMetadata, {
      amount: extracted.amount,
      description: `💸 Payment`,
      payerId: toUser.id,
      splitAmongIds: [toUser.id],
    });

    await sendMessage(sock, groupId,
      `✅ Payment recorded!\n\n` +
      `💵 $${extracted.amount.toFixed(2)}\n` +
      `👤 From: ${fromInfo.userName}\n` +
      `👤 To: ${toInfo.userName}\n\n` +
      `_Balances updated in Splitwise_`
    );

    logger.info({ amount: extracted.amount, groupId }, 'Settlement recorded via conversational AI');

  } catch (error) {
    logger.error({ error }, 'Error recording settlement via AI');
    await sendMessage(sock, groupId, '❌ Failed to record payment. Please try again.');
  }
}

/**
 * Handle balance check with Splitwise
 */
async function handleBalanceWithSplitwise(sock, groupId, groupMetadata) {
  try {
    const splitwiseHandler = getSplitwiseHandler();
    const balances = await splitwiseHandler.getGroupBalances(sock, groupId, groupMetadata);

    if (balances.length === 0) {
      await sendMessage(sock, groupId, '✅ Everyone is settled up! No one owes anyone. 🎉');
      return;
    }

    let message = '*💰 Current Balances*\n\n';

    for (const balance of balances) {
      const amount = Math.abs(balance.amount);
      if (balance.amount > 0) {
        message += `✅ ${balance.userName} gets back $${amount.toFixed(2)}\n`;
      } else {
        message += `💸 ${balance.userName} owes $${amount.toFixed(2)}\n`;
      }
    }

    message += '\n_Real-time from Splitwise_';

    await sendMessage(sock, groupId, message);

  } catch (error) {
    logger.error({ error }, 'Error fetching balances');
    await sendMessage(sock, groupId, '❌ Failed to fetch balances. Please check your Splitwise connection.');
  }
}

/**
 * Handle spending analysis
 */
async function handleSpendingAnalysis(sock, groupId, aiResponse, groupContext) {
  try {
    const { expenses, balances } = groupContext;

    if (expenses.length === 0) {
      await sendMessage(sock, groupId, '📊 No expenses recorded yet. Start tracking to see insights!');
      return;
    }

    // Calculate total spent
    const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.cost || 0), 0);

    // Group by description (basic category detection)
    const categoryTotals = {};
    expenses.forEach(e => {
      const desc = e.description.toLowerCase();
      const category = desc.includes('food') || desc.includes('dinner') || desc.includes('lunch')
        ? 'Food'
        : desc.includes('cab') || desc.includes('uber') || desc.includes('transport')
        ? 'Transport'
        : desc.includes('grocery') || desc.includes('groceries')
        ? 'Groceries'
        : 'Other';

      categoryTotals[category] = (categoryTotals[category] || 0) + parseFloat(e.cost || 0);
    });

    let message = `📊 *Spending Analysis*\n\n`;
    message += `💵 Total Spent: $${totalSpent.toFixed(2)}\n`;
    message += `📝 Number of Expenses: ${expenses.length}\n`;
    message += `💰 Average per Expense: $${(totalSpent / expenses.length).toFixed(2)}\n\n`;

    message += `*By Category:*\n`;
    for (const [category, amount] of Object.entries(categoryTotals)) {
      message += `• ${category}: $${amount.toFixed(2)}\n`;
    }

    if (balances.length > 0) {
      const totalOwed = balances.reduce((sum, b) => sum + Math.abs(b.amount), 0) / 2;
      message += `\n💸 Total Outstanding: $${totalOwed.toFixed(2)}`;
    }

    await sendMessage(sock, groupId, message);

  } catch (error) {
    logger.error({ error }, 'Error analyzing spending');
    await sendMessage(sock, groupId, '❌ Failed to analyze spending. Please try again.');
  }
}

/**
 * Check Splitwise connection and show user info
 */
async function handleCheckSplitwiseConnection(sock, groupId) {
  try {
    const splitwiseHandler = getSplitwiseHandler();

    // Test connection by getting current user info
    const userResult = await splitwiseHandler.client.getCurrentUser();

    // MCP returns data in structuredContent field
    const userData = userResult?.structuredContent || {};
    const user = userData.user;

    if (!user) {
      await sendMessage(sock, groupId, '❌ Splitwise connection failed. Please check your credentials in the .env file.');
      return;
    }

    const firstName = user.first_name || user.firstName || 'Unknown';
    const lastName = user.last_name || user.lastName || '';
    const email = user.email || 'Not available';

    // Get groups
    let groupsMessage = '';
    try {
      const groupsResult = await splitwiseHandler.client.getGroups();
      const groupsData = groupsResult?.structuredContent || {};

      if (groupsData.groups && Array.isArray(groupsData.groups)) {
        const topGroups = groupsData.groups.slice(0, 5);
        groupsMessage = `\n\n📊 *Your Splitwise Groups (${groupsData.groups.length} total):*\n`;
        topGroups.forEach(g => {
          groupsMessage += `• ${g.name} (ID: ${g.id})\n`;
        });
        if (groupsData.groups.length > 5) {
          groupsMessage += `... and ${groupsData.groups.length - 5} more`;
        }
      }
    } catch (groupError) {
      logger.warn('Could not fetch groups', groupError);
    }

    const message = `✅ *Splitwise Connected!*\n\n` +
      `👤 *Account:* ${firstName} ${lastName}\n` +
      `📧 *Email:* ${email}\n` +
      `🔗 *Status:* Active and ready${groupsMessage}\n\n` +
      `💡 You can now add expenses and they'll sync to Splitwise automatically!`;

    await sendMessage(sock, groupId, message);

  } catch (error) {
    logger.error({ error }, 'Error checking Splitwise connection');
    await sendMessage(sock, groupId,
      `❌ *Splitwise Connection Error*\n\n` +
      `Could not connect to Splitwise. Please check:\n` +
      `• Your credentials in .env file\n` +
      `• Internet connection\n` +
      `• Splitwise API status\n\n` +
      `Error: ${error.message || 'Unknown error'}`
    );
  }
}

/**
 * Send help message
 */
async function sendHelpMessage(sock, groupId) {
  const helpText = `
*🤖 Anukul - Your Conversational Expense Expert*

👋 I'm a friendly AI assistant with expertise in group expense management!

*💬 Just Talk to Me:*
"${TRIGGER} hey! add my lunch expense of $15"
"${TRIGGER} how much have we spent on food?"
"${TRIGGER} show me the balances"
"${TRIGGER} john paid me back $20"
"${TRIGGER} what can you help with?"

*💰 Expense Features:*
• Add expenses naturally
• Split bills among friends
• Track who owes whom (real-time via Splitwise)
• Record payments
• Analyze spending patterns

*🌟 Other Features:*
• 📅 Calendar events
• 📊 Group polls
• ⏰ Reminders

*💡 Pro Tips:*
• All expenses sync to Splitwise cloud
• View/edit on Splitwise app/web
• Just chat naturally - I'll understand!
• I can analyze spending and give insights

Let's make expense tracking effortless! 🚀
  `.trim();

  await sendMessage(sock, groupId, helpText);
}

/**
 * Extract message text from WhatsApp message
 */
function extractMessageText(message) {
  return (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    ''
  );
}

export default handleConversationalAI;

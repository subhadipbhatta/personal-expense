import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import { isAIEnabled } from './claudeService.js';
import Expense from '../models/Expense.js';
import Settlement from '../models/Settlement.js';
import CalendarEvent from '../models/CalendarEvent.js';
import Reminder from '../models/Reminder.js';

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
 * Build comprehensive context from all group data
 */
async function buildGroupContext(groupId, groupMetadata) {
  const context = {
    groupName: groupMetadata.subject,
    memberCount: groupMetadata.participants.length,
    members: [],
    expenses: [],
    balances: [],
    events: [],
    reminders: []
  };

  // Get member names
  context.members = groupMetadata.participants.map(p => {
    const name = p.notify || p.name || p.pushName || p.id.split('@')[0];
    return name;
  });

  // Get recent expenses (last 20)
  try {
    const recentExpenses = await Expense.find({ groupId })
      .sort({ createdAt: -1 })
      .limit(20);

    context.expenses = recentExpenses.map(e => ({
      description: e.description,
      amount: e.amount,
      paidBy: e.paidBy.userName,
      splitAmong: e.splitAmong.map(s => s.userName),
      date: e.createdAt,
      settled: e.fullySettled
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching expenses for context');
  }

  // Calculate balances
  try {
    const unsettledExpenses = await Expense.find({
      groupId,
      fullySettled: false
    });

    const balanceMap = new Map();

    for (const expense of unsettledExpenses) {
      for (const split of expense.splitAmong) {
        if (!split.settled && split.userId !== expense.paidBy.userId) {
          const key = `${split.userName}→${expense.paidBy.userName}`;
          const current = balanceMap.get(key) || 0;
          balanceMap.set(key, current + (split.amount - (split.settledAmount || 0)));
        }
      }
    }

    context.balances = Array.from(balanceMap.entries())
      .map(([key, amount]) => {
        const [debtor, creditor] = key.split('→');
        return { debtor, creditor, amount: amount.toFixed(2) };
      })
      .filter(b => b.amount > 0);
  } catch (error) {
    logger.error({ error }, 'Error calculating balances for context');
  }

  // Get upcoming events (next 30 days)
  try {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const upcomingEvents = await CalendarEvent.find({
      groupId,
      startTime: { $gte: now, $lte: thirtyDaysLater }
    }).sort({ startTime: 1 }).limit(10);

    context.events = upcomingEvents.map(e => ({
      title: e.title,
      startTime: e.startTime,
      location: e.location,
      createdBy: e.createdBy.userName
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching events for context');
  }

  // Get pending reminders
  try {
    const pendingReminders = await Reminder.find({
      groupId,
      sent: false,
      cancelled: false,
      scheduledFor: { $gte: new Date() }
    }).sort({ scheduledFor: 1 }).limit(10);

    context.reminders = pendingReminders.map(r => ({
      message: r.message,
      scheduledFor: r.scheduledFor,
      targetUsers: r.targetUsers.map(u => u.userName)
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching reminders for context');
  }

  return context;
}

/**
 * Handle conversational AI query
 */
export async function handleConversationalQuery(userQuery, groupId, groupMetadata, senderName) {
  if (!isAIEnabled()) {
    logger.info('AI not enabled, skipping conversational response');
    return null;
  }

  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    // Build comprehensive context
    const context = await buildGroupContext(groupId, groupMetadata);

    logger.info({
      userQuery,
      groupId,
      contextSize: {
        expenses: context.expenses.length,
        balances: context.balances.length,
        events: context.events.length,
        reminders: context.reminders.length
      }
    }, 'Processing conversational query with AI');

    // Build system prompt
    const systemPrompt = `You are Anukul, a helpful WhatsApp assistant for the group "${context.groupName}".

You have access to the group's:
- Expense tracking and balances
- Calendar events
- Reminders
- Poll results (when asked)

**Your role:**
- Answer questions about group data naturally
- Provide summaries and insights
- Give recommendations based on patterns
- Be friendly, concise, and helpful
- Use emojis appropriately

**Response guidelines:**
- Be conversational and natural
- Provide specific data when available
- Give actionable recommendations
- Keep responses under 500 words
- Use WhatsApp-friendly formatting (bold with *, bullets with •)

**Available data:**
Members: ${context.members.join(', ')}
Recent expenses: ${context.expenses.length} tracked
Outstanding balances: ${context.balances.length} pending
Upcoming events: ${context.events.length}
Pending reminders: ${context.reminders.length}`;

    // Build context details
    let contextDetails = '';

    if (context.expenses.length > 0) {
      contextDetails += '\n\n**Recent Expenses:**\n';
      context.expenses.slice(0, 5).forEach(e => {
        contextDetails += `• $${e.amount.toFixed(2)} for ${e.description} (paid by ${e.paidBy})\n`;
      });
    }

    if (context.balances.length > 0) {
      contextDetails += '\n\n**Outstanding Balances:**\n';
      context.balances.forEach(b => {
        contextDetails += `• ${b.debtor} owes ${b.creditor}: $${b.amount}\n`;
      });
    }

    if (context.events.length > 0) {
      contextDetails += '\n\n**Upcoming Events:**\n';
      context.events.forEach(e => {
        const date = new Date(e.startTime).toLocaleDateString();
        contextDetails += `• ${e.title} on ${date}\n`;
      });
    }

    if (context.reminders.length > 0) {
      contextDetails += '\n\n**Pending Reminders:**\n';
      context.reminders.forEach(r => {
        const date = new Date(r.scheduledFor).toLocaleDateString();
        contextDetails += `• ${r.message} on ${date}\n`;
      });
    }

    // Call Claude API
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${contextDetails}\n\n**User (${senderName}) asks:** ${userQuery}\n\nProvide a helpful, conversational response based on the group's data.`
        }
      ]
    });

    const aiResponse = response.content[0].text;

    logger.info({
      userQuery,
      responseLength: aiResponse.length,
      tokensUsed: response.usage
    }, 'AI conversational response generated');

    return aiResponse;

  } catch (error) {
    logger.error({ error, userQuery }, 'Error in conversational AI');
    return null;
  }
}

/**
 * Detect if a message is a conversational query (not a command)
 */
export function isConversationalQuery(messageText) {
  const conversationalPatterns = [
    // Questions
    /\bwhat\b/i,
    /\bwho\b/i,
    /\bwhen\b/i,
    /\bwhere\b/i,
    /\bwhy\b/i,
    /\bhow\s+(much|many|often)\b/i,
    /\bcan\s+you\b/i,
    /\bcould\s+you\b/i,
    /\bshould\s+(i|we)\b/i,

    // Requests for analysis
    /\bsummarize\b/i,
    /\bsummary\b/i,
    /\banalyze\b/i,
    /\btell\s+me\s+about\b/i,
    /\bshow\s+me\b/i,
    /\bgive\s+me\b/i,
    /\bhelp\s+me\s+with\b/i,  // "help me with X" goes to AI
    /\brecommend\b/i,
    /\bsuggestion\b/i,

    // Polls and voting (only questions, not commands like "create poll")
    /\bpoll\s+result/i,
    /\bvoting\s+result/i,
    /\bresult\b/i,       // Any mention of "result"
    /\bwho\s+voted/i,
    /\bhow\s+many\s+vote/i,
    /\bwin(ning|ner)\b/i,
    /\bcount.*vote/i,
    /\bvote.*count/i,

    // Insights
    /\binsight/i,
    /\bpattern/i,
    /\btrend/i,
    /\bmost\s+(expensive|common)/i,
    /\btotal\s+spent/i,
    /\baverage\b/i
  ];

  // Check if message matches any conversational pattern
  for (const pattern of conversationalPatterns) {
    if (pattern.test(messageText)) {
      return true;
    }
  }

  return false;
}

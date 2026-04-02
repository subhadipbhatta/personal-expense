import logger from '../utils/logger.js';
import { parseCommand } from '../utils/commandParser.js';
import { handleExpenseCommand } from '../modules/expenses/handler.js';
import { handleSettleCommand } from '../modules/settlements/handler.js';
import { handleBalanceCommand } from '../modules/balance/handler.js';
import { handleCalendarCommand, handleListEventsCommand } from '../modules/calendar/handler.js';
import { handlePollCommand } from '../modules/polls/handler.js';
import { handleReminderCommand, handleListRemindersCommand, handleCancelReminderCommand } from '../modules/reminders/handler.js';
import {
  detectConversationalIntent,
  handleGreeting,
  handleThankYou,
  handleWellbeingCheck,
  provideSuggestions
} from '../modules/conversational/handler.js';

const TRIGGER = process.env.BOT_TRIGGER || '@anukul';

export async function handleMessage(sock, message) {
  try {
    const messageText = extractMessageText(message);
    if (!messageText) return;

    // Check if message is for this bot
    if (!messageText.toLowerCase().includes(TRIGGER.toLowerCase())) {
      return;
    }

    const groupId = message.key.remoteJid;
    const senderId = message.key.participant || message.key.remoteJid;
    const isGroup = groupId.endsWith('@g.us');

    // Only work in groups
    if (!isGroup) {
      await sendMessage(sock, groupId, '❌ This bot only works in WhatsApp groups.');
      return;
    }

    // Check for conversational intent first
    const conversationalIntent = detectConversationalIntent(messageText);
    if (conversationalIntent) {
      logger.info({ intent: conversationalIntent.type, groupId }, 'Handling conversational message');

      switch (conversationalIntent.type) {
        case 'greeting':
          await handleGreeting(sock, message, conversationalIntent.match);
          return;

        case 'thankYou':
          await handleThankYou(sock, message);
          return;

        case 'wellbeing':
          await handleWellbeingCheck(sock, message);
          return;

        case 'suggestions':
          await provideSuggestions(sock, message, conversationalIntent.context);
          return;

        case 'help':
          await sendHelpMessage(sock, groupId);
          return;
      }
    }

    // Parse command
    const command = parseCommand(messageText, TRIGGER);
    logger.info({ command, groupId, senderId }, 'Processing command');

    // Route to appropriate handler
    switch (command.action) {
      case 'add':
      case 'split':
        await handleExpenseCommand(sock, message, command);
        break;

      case 'settle':
      case 'paid':
        await handleSettleCommand(sock, message, command);
        break;

      case 'balance':
      case 'balances':
      case 'summary':
        await handleBalanceCommand(sock, message, command);
        break;

      case 'calendar':
      case 'schedule':
      case 'event':
        await handleCalendarCommand(sock, message, command);
        break;

      case 'list-events':
      case 'events':
        await handleListEventsCommand(sock, message);
        break;

      case 'poll':
        await handlePollCommand(sock, message, command);
        break;

      case 'reminder':
      case 'remind':
        await handleReminderCommand(sock, message, command);
        break;

      case 'list-reminders':
      case 'reminders':
        await handleListRemindersCommand(sock, message);
        break;

      case 'cancel-reminder':
        await handleCancelReminderCommand(sock, message, command);
        break;

      case 'help':
      default:
        await sendHelpMessage(sock, groupId);
        break;
    }
  } catch (error) {
    logger.error('Error in message handler:', error);
    const groupId = message.key.remoteJid;
    await sendMessage(sock, groupId, '❌ Sorry, something went wrong. Please try again.');
  }
}

function extractMessageText(message) {
  return (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    ''
  );
}

export async function sendMessage(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (error) {
    logger.error('Error sending message:', error);
  }
}

async function sendHelpMessage(sock, groupId) {
  const helpText = `
*💰 Anukul - Your WhatsApp Assistant*

👋 I'm conversational! Try "${TRIGGER} hi" or "${TRIGGER} suggest something"

*📊 Expense Management:*
${TRIGGER} add expense $50 dinner
${TRIGGER} split expense $120 @john @jane
${TRIGGER} balance expense

*📅 Calendar & Events:*
${TRIGGER} book calendar Team Meeting tomorrow 3pm
${TRIGGER} list events

*📊 Polls:*
${TRIGGER} create poll What to eat? Pizza, Burgers, Sushi
${TRIGGER} poll Best time? 2pm, 3pm, 4pm

*⏰ Reminders:*
${TRIGGER} remind me to check expenses tomorrow 9am
${TRIGGER} list reminders

*💬 Conversational:*
• Say hi! → ${TRIGGER} hello
• Ask for help → ${TRIGGER} what can you do?
• Get suggestions → ${TRIGGER} suggest something
• Thank me → ${TRIGGER} thank you

*Quick Tips:*
• I understand natural language! Just talk to me naturally.
• Try "${TRIGGER} help me with expenses" for specific guidance

Just mention ${TRIGGER} in any group message! 🚀
  `.trim();

  await sendMessage(sock, groupId, helpText);
}

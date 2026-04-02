import Reminder from '../../models/Reminder.js';
import { sendMessage } from '../../bot/messageHandler.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import { parseDateTime, getRelativeTime } from '../../utils/dateParser.js';
import logger from '../../utils/logger.js';

/**
 * Handle reminder creation command
 * Examples:
 *  - @anukul remind me to check expenses tomorrow at 9am
 *  - @anukul set reminder Pay bills on Friday 5pm
 *  - @anukul reminder Meeting prep in 2 hours
 */
export async function handleReminderCommand(sock, message, command) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;

  try {
    // Get group metadata and creator info
    const groupMetadata = await sock.groupMetadata(groupId);
    const creator = await getUserInfo(sock, groupMetadata, senderId);

    // Extract original message text (BEFORE command parser strips numbers)
    const originalMessageText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';

    // Remove trigger word from original message
    const TRIGGER = process.env.BOT_TRIGGER || '@anukul';
    const textWithoutTrigger = originalMessageText
      .replace(new RegExp(TRIGGER, 'gi'), '')
      .trim();

    // Remove the reminder action keywords to get just the reminder text
    let textToParse = textWithoutTrigger
      .replace(/^remind\s+me\s+to\s+/i, '')
      .replace(/^remind\s+to\s+/i, '')  // Also handle "remind to" without "me"
      .replace(/^remind\s+me\s+/i, '')
      .replace(/^remind\s+/i, '')
      .replace(/^set\s+reminder\s+to\s+/i, '')
      .replace(/^set\s+reminder\s+/i, '')
      .replace(/^reminder\s+/i, '')
      .trim();

    // Log what we received
    logger.info({
      originalMessageText,
      textWithoutTrigger,
      textToParse,
      commandDescription: command.description,
      commandRawText: command.rawText
    }, 'Reminder handler processing');

    const parseResult = parseReminderCommand(textToParse);

    if (!parseResult.success) {
      logger.warn({
        textToParse,
        parseError: parseResult.error
      }, 'Reminder parsing failed');

      await sendMessage(sock, groupId,
        `❌ Could not parse reminder. Please use:\n\n` +
        `@anukul remind me to <message> <time>\n\n` +
        `Examples:\n` +
        `• @anukul remind me to check expenses tomorrow at 9am\n` +
        `• @anukul set reminder Pay bills on Friday 5pm\n` +
        `• @anukul reminder Meeting in 2 hours\n\n` +
        `Debug: I received "${textToParse}"`
      );
      return;
    }

    const { message: reminderMessage, scheduledFor } = parseResult;

    // Validate time is in future (with buffer for processing time)
    const now = new Date();
    const bufferTime = new Date(now.getTime() + 10000); // 10 seconds buffer

    if (scheduledFor <= bufferTime) {
      const relativeTime = getRelativeTime(scheduledFor);
      await sendMessage(sock, groupId,
        `❌ Reminder time must be in the future.\n\n` +
        `You asked for: *${relativeTime}*\n` +
        `Please try again with a time at least 15 seconds from now.\n\n` +
        `*Examples:*\n` +
        `• @anukul remind me to check logs in 5 minutes\n` +
        `• @anukul remind me to call client in 1 hour\n` +
        `• @anukul remind me to submit report tomorrow at 9am`
      );
      return;
    }

    // Determine target users (if mentions, otherwise creator only)
    const targetUsers = [];
    if (command.mentions && command.mentions.length > 0) {
      for (const mention of command.mentions) {
        const user = groupMetadata.participants.find(
          p => p.id.includes(mention) ||
               p.notify?.toLowerCase().includes(mention.toLowerCase())
        );
        if (user) {
          const userInfo = await getUserInfo(sock, groupMetadata, user.id);
          targetUsers.push({
            userId: userInfo.userId,
            userName: userInfo.userName
          });
        }
      }
    }

    // If no mentions, remind the creator
    if (targetUsers.length === 0) {
      targetUsers.push({
        userId: creator.userId,
        userName: creator.userName
      });
    }

    // Create reminder in database
    const reminder = new Reminder({
      groupId,
      message: reminderMessage,
      scheduledFor,
      createdBy: {
        userId: creator.userId,
        userName: creator.userName
      },
      targetUsers
    });

    await reminder.save();
    logger.info({ reminderId: reminder._id, scheduledFor }, 'Reminder created');

    // Send confirmation
    const relativeTime = getRelativeTime(scheduledFor);
    const targetNames = targetUsers.map(u => u.userName).join(', ');

    const confirmation = `
⏰ *Reminder Set*

📝 Message: ${reminderMessage}
📅 When: ${scheduledFor.toLocaleString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
})}
⏳ ${relativeTime}
👤 For: ${targetNames}

I'll remind you! 🔔
    `.trim();

    await sendMessage(sock, groupId, confirmation);

  } catch (error) {
    logger.error({ error }, 'Error handling reminder command');
    await sendMessage(sock, groupId, '❌ Failed to create reminder. Please try again.');
  }
}

/**
 * Parse reminder command to extract message and time
 * Expects text like: "set an alarm at 8:30 pm" or "check logs in 20 minutes"
 */
function parseReminderCommand(text) {
  // Remove common reminder prefix words (these might still be present)
  let cleanText = text
    .replace(/^(to|about|for)\s+/i, '')
    .trim();

  // Try to parse date/time with chrono-node
  const dateResult = parseDateTime(cleanText);

  if (!dateResult.success) {
    return { success: false, error: 'Could not parse time' };
  }

  // Extract message more reliably
  let message = '';

  // Strategy 1: Use text before time keywords
  // Handle "in X minutes/hours" pattern specifically
  const inPattern = /\s+in\s+(\d+|a|an|half)\s+(minute|min|mins|hour|hr|hrs|hours?|minutes?)/i;
  const atPattern = /\s+(at|@)\s+\d{1,2}/i;
  const onPattern = /\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)/i;
  const tomorrowPattern = /\s+tomorrow/i;

  let match = cleanText.match(inPattern) ||
              cleanText.match(atPattern) ||
              cleanText.match(onPattern) ||
              cleanText.match(tomorrowPattern);

  if (match) {
    message = cleanText.substring(0, match.index).trim();
  }

  // Strategy 2: Use dateResult.title if message still empty
  if (!message && dateResult.title) {
    message = dateResult.title;
  }

  // Final cleanup
  message = message
    .replace(/^(to|about|for)\s+/i, '')
    .replace(/^remind\s+(me\s+)?to\s+/i, '')
    .replace(/^(remember|don't forget)\s+to\s+/i, '')
    .trim();

  if (!message || message.length < 2) {
    message = 'Reminder';
  }

  logger.info({
    originalInput: text,
    cleanText,
    parsedMessage: message,
    scheduledFor: dateResult.startTime.toISOString(),
    currentTime: new Date().toISOString()
  }, 'Reminder command parsed');

  return {
    success: true,
    message,
    scheduledFor: dateResult.startTime
  };
}

/**
 * List pending reminders
 */
export async function handleListRemindersCommand(sock, message) {
  const groupId = message.key.remoteJid;

  try {
    const now = new Date();
    const reminders = await Reminder.find({
      groupId,
      sent: false,
      cancelled: false,
      scheduledFor: { $gte: now }
    })
    .sort({ scheduledFor: 1 })
    .limit(10);

    if (reminders.length === 0) {
      await sendMessage(sock, groupId, '⏰ No pending reminders.');
      return;
    }

    const reminderList = reminders.map((reminder, index) => {
      const timeStr = reminder.scheduledFor.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const relativeTime = getRelativeTime(reminder.scheduledFor);
      return `${index + 1}. *${reminder.message}*\n   📅 ${timeStr} (${relativeTime})`;
    }).join('\n\n');

    await sendMessage(sock, groupId, `⏰ *Pending Reminders*\n\n${reminderList}`);

  } catch (error) {
    logger.error({ error }, 'Error listing reminders');
    await sendMessage(sock, groupId, '❌ Failed to retrieve reminders.');
  }
}

/**
 * Cancel a reminder
 */
export async function handleCancelReminderCommand(sock, message, command) {
  const groupId = message.key.remoteJid;

  try {
    // Get the most recent pending reminder
    const reminder = await Reminder.findOne({
      groupId,
      sent: false,
      cancelled: false
    }).sort({ createdAt: -1 });

    if (!reminder) {
      await sendMessage(sock, groupId, '⏰ No pending reminders to cancel.');
      return;
    }

    reminder.cancelled = true;
    await reminder.save();

    await sendMessage(sock, groupId,
      `✅ Cancelled reminder: "${reminder.message}"`
    );

    logger.info({ reminderId: reminder._id }, 'Reminder cancelled');

  } catch (error) {
    logger.error({ error }, 'Error cancelling reminder');
    await sendMessage(sock, groupId, '❌ Failed to cancel reminder.');
  }
}

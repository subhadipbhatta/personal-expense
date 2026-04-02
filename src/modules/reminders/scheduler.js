import cron from 'node-cron';
import Reminder from '../../models/Reminder.js';
import logger from '../../utils/logger.js';

let socket = null;

/**
 * Initialize reminder scheduler
 * Checks every minute for reminders that need to be sent
 *
 * @param {object} sock - WhatsApp socket instance
 */
export function initializeReminderScheduler(sock) {
  socket = sock;

  // Run every minute
  cron.schedule('* * * * *', async () => {
    await checkAndSendReminders();
  });

  logger.info('Reminder scheduler initialized');
}

/**
 * Check for pending reminders and send them
 */
async function checkAndSendReminders() {
  if (!socket) {
    logger.warn('Socket not available for reminder scheduler');
    return;
  }

  try {
    const now = new Date();

    // Find reminders that are due (scheduled for now or in the past)
    const dueReminders = await Reminder.find({
      sent: false,
      cancelled: false,
      scheduledFor: { $lte: now }
    }).limit(50); // Process max 50 reminders at once

    if (dueReminders.length === 0) {
      return;
    }

    logger.info({ count: dueReminders.length }, 'Processing due reminders');

    for (const reminder of dueReminders) {
      try {
        await sendReminder(reminder);

        // Mark as sent
        reminder.sent = true;
        reminder.sentAt = new Date();
        await reminder.save();

        logger.info({
          reminderId: reminder._id,
          groupId: reminder.groupId,
          message: reminder.message
        }, 'Reminder sent successfully');

      } catch (error) {
        logger.error({
          error,
          reminderId: reminder._id
        }, 'Failed to send reminder');
      }
    }

  } catch (error) {
    logger.error({ error }, 'Error in reminder scheduler');
  }
}

/**
 * Send a single reminder with mentions for notifications
 */
async function sendReminder(reminder) {
  const { groupId, message, targetUsers, createdBy } = reminder;

  // Build mentions array for WhatsApp (triggers notifications)
  const mentions = [];
  let mentionText = '';

  if (targetUsers && targetUsers.length > 0) {
    targetUsers.forEach(u => {
      // Add to WhatsApp mentions array (important for notifications!)
      mentions.push(u.userId);
      // Build display text
      mentionText += `@${u.userName} `;
    });
  }

  // Enhanced notification message with emojis and formatting
  const reminderMessage = `
🔔🔔🔔 *REMINDER ALERT* 🔔🔔🔔

📝 *${message.toUpperCase()}*

${mentionText ? `👤 For: ${mentionText}\n` : ''}
⏰ Set by: ${createdBy.userName}

🎯 *Time to take action!*
  `.trim();

  // Send with mentions array to trigger WhatsApp notifications
  await socket.sendMessage(groupId, {
    text: reminderMessage,
    mentions: mentions  // This makes WhatsApp buzz/notify the users!
  });

  logger.info({
    groupId,
    message,
    mentionCount: mentions.length
  }, 'Reminder notification sent with mentions');
}

/**
 * Clean up old reminders
 * Call this periodically to remove sent reminders older than 30 days
 */
export async function cleanupOldReminders() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Reminder.deleteMany({
      sent: true,
      sentAt: { $lt: thirtyDaysAgo }
    });

    if (result.deletedCount > 0) {
      logger.info({ count: result.deletedCount }, 'Cleaned up old reminders');
    }

  } catch (error) {
    logger.error({ error }, 'Error cleaning up old reminders');
  }
}

// Run cleanup daily at midnight
cron.schedule('0 0 * * *', cleanupOldReminders);

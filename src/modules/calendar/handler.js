import CalendarEvent from '../../models/CalendarEvent.js';
import { sendMessage } from '../../bot/messageHandler.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import logger from '../../utils/logger.js';
import { parseDateTime } from '../../utils/dateParser.js';
import { generateICS } from '../../utils/icsGenerator.js';
import fs from 'fs';
import path from 'path';

/**
 * Handle calendar booking command
 * Examples:
 *  - @anukul book calendar Team Meeting tomorrow at 3pm
 *  - @anukul book calendar Lunch on Friday 12pm to 1pm
 *  - @anukul book calendar Birthday Party on 25th Dec 6pm
 */
export async function handleCalendarCommand(sock, message, command) {
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

    // Remove trigger and calendar action keywords
    const TRIGGER = process.env.BOT_TRIGGER || '@anukul';
    const textToParse = originalMessageText
      .replace(new RegExp(TRIGGER, 'gi'), '')
      .replace(/^book\s+calendar\s+/i, '')
      .replace(/^schedule\s+event\s+/i, '')
      .replace(/^add\s+event\s+/i, '')
      .replace(/^calendar\s+/i, '')
      .replace(/^event\s+/i, '')
      .trim();

    // Parse the calendar command with original text (numbers intact)
    const parseResult = parseDateTime(textToParse);

    if (!parseResult.success) {
      await sendMessage(sock, groupId,
        `❌ Could not parse date/time from: "${textToParse}"\n\n` +
        `Try formats like:\n` +
        `• "Team Meeting tomorrow at 3pm"\n` +
        `• "Lunch on Friday 12pm to 1pm"\n` +
        `• "Birthday on Dec 25 at 6pm"`
      );
      return;
    }

    const { title, startTime, endTime, location } = parseResult;

    // Create calendar event in database
    const event = new CalendarEvent({
      groupId,
      title: title || 'Event',
      description: command.description,
      startTime,
      endTime,
      location: location || '',
      createdBy: {
        userId: creator.userId,
        userName: creator.userName
      },
      attendees: [] // Can be populated from mentions if needed
    });

    // Generate ICS file content
    const icsContent = await generateICS({
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      organizer: creator.userName
    });

    event.icsContent = icsContent;
    await event.save();

    logger.info({ eventId: event._id, groupId }, 'Calendar event created');

    // Save ICS to temporary file
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const icsFileName = `${event.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.ics`;
    const icsFilePath = path.join(tempDir, icsFileName);
    fs.writeFileSync(icsFilePath, icsContent);

    // Send confirmation message
    const confirmationMessage = `
📅 *Calendar Event Created*

📝 Title: ${event.title}
📆 Start: ${event.startTime.toLocaleString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
})}
⏰ End: ${event.endTime.toLocaleString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
})}
${location ? `📍 Location: ${location}\n` : ''}
👤 Created by: ${creator.userName}

Calendar invite attached! 📎
    `.trim();

    await sendMessage(sock, groupId, confirmationMessage);

    // Send ICS file as document
    await sock.sendMessage(groupId, {
      document: fs.readFileSync(icsFilePath),
      fileName: icsFileName,
      mimetype: 'text/calendar',
      caption: `📅 ${event.title} - Calendar Invite`
    });

    // Clean up temp file
    fs.unlinkSync(icsFilePath);

  } catch (error) {
    logger.error({ error }, 'Error handling calendar command');
    await sendMessage(sock, groupId, '❌ Failed to create calendar event. Please try again.');
  }
}

/**
 * List upcoming calendar events
 */
export async function handleListEventsCommand(sock, message) {
  const groupId = message.key.remoteJid;

  try {
    const now = new Date();
    const events = await CalendarEvent.find({
      groupId,
      cancelled: false,
      startTime: { $gte: now }
    })
    .sort({ startTime: 1 })
    .limit(10);

    if (events.length === 0) {
      await sendMessage(sock, groupId, '📅 No upcoming events scheduled.');
      return;
    }

    const eventList = events.map((event, index) => {
      const startStr = event.startTime.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${index + 1}. *${event.title}*\n   📆 ${startStr}\n   👤 ${event.createdBy.userName}`;
    }).join('\n\n');

    await sendMessage(sock, groupId, `📅 *Upcoming Events*\n\n${eventList}`);

  } catch (error) {
    logger.error({ error }, 'Error listing events');
    await sendMessage(sock, groupId, '❌ Failed to retrieve events.');
  }
}

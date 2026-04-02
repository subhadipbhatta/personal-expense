import { sendMessage } from '../../bot/messageHandler.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import logger from '../../utils/logger.js';

/**
 * Handle poll creation command
 * Examples:
 *  - @anukul create poll What should we eat? Pizza, Burgers, Sushi
 *  - @anukul poll Where to meet? Office, Cafe, Park
 */
export async function handlePollCommand(sock, message, command) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;

  try {
    // Get group metadata and creator info
    const groupMetadata = await sock.groupMetadata(groupId);
    const creator = await getUserInfo(sock, groupMetadata, senderId);

    // Parse poll question and options
    const parseResult = parsePollCommand(command.description || command.rawText);

    if (!parseResult.success) {
      await sendMessage(sock, groupId,
        `❌ Could not parse poll. Please use this format:\n\n` +
        `@anukul create poll Question? Option1, Option2, Option3\n\n` +
        `Examples:\n` +
        `• @anukul create poll What should we eat? Pizza, Burgers, Sushi\n` +
        `• @anukul poll Best time to meet? 2pm, 3pm, 4pm`
      );
      return;
    }

    const { question, options } = parseResult;

    // Validate options count (WhatsApp allows 2-12 options)
    if (options.length < 2) {
      await sendMessage(sock, groupId, '❌ Poll needs at least 2 options.');
      return;
    }

    if (options.length > 12) {
      await sendMessage(sock, groupId, '❌ Poll can have maximum 12 options.');
      return;
    }

    // Create and send poll using Baileys API
    await sock.sendMessage(groupId, {
      poll: {
        name: question,
        values: options,
        selectableCount: 1 // Single choice poll
      }
    });

    logger.info({ groupId, question, optionsCount: options.length, creator: creator.userName },
      'Poll created successfully'
    );

    // Note: WhatsApp will show the poll directly, no confirmation message needed

  } catch (error) {
    logger.error({ error }, 'Error handling poll command');

    if (error.message?.includes('poll')) {
      await sendMessage(sock, groupId,
        '❌ Failed to create poll. Make sure you\'re in a group chat and the poll format is correct.'
      );
    } else {
      await sendMessage(sock, groupId, '❌ Failed to create poll. Please try again.');
    }
  }
}

/**
 * Parse poll command to extract question and options
 *
 * Supports formats:
 *  - "Question? Option1, Option2, Option3"
 *  - "Question? Option1 | Option2 | Option3"
 *  - "Question: Option1, Option2"
 */
function parsePollCommand(text) {
  // Try to find question delimiter (? or :)
  const questionMatch = text.match(/^(.+?)[\?:]\s*(.+)$/);

  if (!questionMatch) {
    return { success: false, error: 'Could not find question and options' };
  }

  const question = questionMatch[1].trim();
  const optionsText = questionMatch[2].trim();

  // Split options by comma or pipe
  let options = [];
  if (optionsText.includes(',')) {
    options = optionsText.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
  } else if (optionsText.includes('|')) {
    options = optionsText.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
  } else {
    // If no delimiter, maybe they used spaces? Try to split intelligently
    options = optionsText.split(/\s+(?:or|vs)\s+/i);
    if (options.length < 2) {
      // Last resort: split by multiple spaces
      options = optionsText.split(/\s{2,}/).filter(opt => opt.length > 0);
    }
  }

  // Validate we have options
  if (options.length === 0) {
    return { success: false, error: 'No options found. Separate options with commas.' };
  }

  // Truncate options to max 100 characters each (WhatsApp limit)
  options = options.map(opt => opt.substring(0, 100));

  return {
    success: true,
    question,
    options
  };
}

/**
 * Handle multi-select poll creation
 */
export async function handleMultiPollCommand(sock, message, command) {
  const groupId = message.key.remoteJid;

  try {
    const parseResult = parsePollCommand(command.description || command.rawText);

    if (!parseResult.success) {
      await sendMessage(sock, groupId,
        `❌ Could not parse poll. Use format: Question? Option1, Option2, Option3`
      );
      return;
    }

    const { question, options } = parseResult;

    // Validate options
    if (options.length < 2 || options.length > 12) {
      await sendMessage(sock, groupId,
        '❌ Poll needs 2-12 options.'
      );
      return;
    }

    // Create multi-select poll
    await sock.sendMessage(groupId, {
      poll: {
        name: question,
        values: options,
        selectableCount: 0 // 0 means multi-select
      }
    });

    logger.info({ groupId, question, multiSelect: true }, 'Multi-select poll created');

  } catch (error) {
    logger.error({ error }, 'Error creating multi-select poll');
    await sendMessage(sock, groupId, '❌ Failed to create poll.');
  }
}

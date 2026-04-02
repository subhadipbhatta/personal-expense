import Expense from '../../models/Expense.js';
import { sendMessage } from '../../bot/messageHandler.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import { findUserByMention, getParticipantsList } from '../../utils/userMatcher.js';
import { getSplitwiseHandler } from '../splitwise/handler.js';
import logger from '../../utils/logger.js';

export async function handleExpenseCommand(sock, message, command) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;

  // Validate amount
  if (!command.amount || command.amount <= 0) {
    await sendMessage(sock, groupId, '❌ Please provide a valid amount. Example: @expense add $50 dinner');
    return;
  }

  try {
    // Get group metadata to fetch participant info
    const groupMetadata = await sock.groupMetadata(groupId);
    const payer = await getUserInfo(sock, groupMetadata, senderId);

    // Determine who to split among
    let participants = [];

    if (command.mentions && command.mentions.length > 0) {
      // Split among mentioned users
      const notFound = [];

      for (const mention of command.mentions) {
        const user = findUserByMention(mention, groupMetadata);

        if (user) {
          participants.push(await getUserInfo(sock, groupMetadata, user.id));
        } else {
          notFound.push(mention);
        }
      }

      if (participants.length === 0) {
        // Show available participants to help user
        const availableUsers = getParticipantsList(groupMetadata)
          .slice(0, 10) // Show first 10 users
          .map(u => `• ${u.displayName}`)
          .join('\n');

        await sendMessage(sock, groupId,
          `❌ Could not find mentioned users: ${notFound.join(', ')}\n\n` +
          `*Available group members:*\n${availableUsers}\n\n` +
          `💡 Tip: Use first name or phone number to mention users.`
        );
        return;
      }

      // Warn about not found users but proceed with found ones
      if (notFound.length > 0) {
        await sendMessage(sock, groupId,
          `⚠️ Warning: Could not find: ${notFound.join(', ')}\n` +
          `Proceeding with ${participants.length} user(s)...`
        );
      }
    } else {
      // Split among all group members
      participants = await Promise.all(
        groupMetadata.participants.map(p => getUserInfo(sock, groupMetadata, p.id))
      );
    }

    // Calculate split
    const splitAmount = command.amount / participants.length;

    // Build splitAmong array for MongoDB
    const splitAmong = participants.map(p => ({
      userId: p.userId,
      userName: p.userName,
      amount: splitAmount,
      settled: p.userId === payer.userId // Mark payer's share as settled
    }));

    let splitwiseExpenseId = null;
    let storageMode = 'MongoDB';

    // Try Splitwise integration if not in test mode
    if (process.env.NODE_ENV !== 'test') {
      try {
        const splitwiseHandler = getSplitwiseHandler();
        const splitwiseExpense = await splitwiseHandler.addExpense(sock, groupId, groupMetadata, {
          amount: command.amount,
          description: command.description,
          payerId: payer.userId,
          splitAmongIds: participants.map(p => p.userId),
        });

        splitwiseExpenseId = splitwiseExpense.id;
        storageMode = 'Splitwise + MongoDB';
        logger.info({ splitwiseExpenseId, groupId }, 'Expense created in Splitwise');
      } catch (splitwiseError) {
        logger.warn({ error: splitwiseError }, 'Splitwise integration unavailable, using MongoDB only');
        storageMode = 'MongoDB (Splitwise offline)';
      }
    }

    // Always save to MongoDB as backup/fallback
    const expense = await Expense.create({
      groupId,
      description: command.description,
      amount: command.amount,
      currency: 'USD',
      paidBy: {
        userId: payer.userId,
        userName: payer.userName
      },
      splitAmong,
      totalSettled: splitAmount, // Payer's share is auto-settled
      fullySettled: participants.length === 1,
      splitwiseExpenseId
    });

    logger.info({ expenseId: expense._id, groupId, storageMode }, 'Expense saved');

    // Send confirmation
    const participantList = participants.map(p => p.userName).join(', ');
    const response = `
✅ *Expense Added*

💵 Amount: $${command.amount.toFixed(2)}
📝 Description: ${command.description}
👤 Paid by: ${payer.userName}
👥 Split among: ${participantList}
💰 Each owes: $${splitAmount.toFixed(2)}

Use \`@expense balance\` to see balances.
    `.trim();

    await sendMessage(sock, groupId, response);
  } catch (error) {
    logger.error('Error handling expense command:', error);
    await sendMessage(sock, groupId, '❌ Failed to add expense. Please try again.');
  }
}

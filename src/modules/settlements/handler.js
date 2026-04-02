import { sendMessage } from '../../bot/messageHandler.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import { findUserByMention, getParticipantsList } from '../../utils/userMatcher.js';
import { getSplitwiseHandler } from '../splitwise/handler.js';
import Settlement from '../../models/Settlement.js';
import Expense from '../../models/Expense.js';
import logger from '../../utils/logger.js';

export async function handleSettleCommand(sock, message, command) {
  const groupId = message.key.remoteJid;
  const senderId = message.key.participant || message.key.remoteJid;

  // Validate amount
  if (!command.amount || command.amount <= 0) {
    await sendMessage(sock, groupId, '❌ Please provide a valid amount. Example: @anukul settle @john $25');
    return;
  }

  // Validate mentions
  if (!command.mentions || command.mentions.length === 0) {
    await sendMessage(sock, groupId, '❌ Please mention who you paid. Example: @anukul settle @john $25');
    return;
  }

  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const from = await getUserInfo(sock, groupMetadata, senderId);

    // Find the mentioned user using improved matching
    const toMention = command.mentions[0];
    const toUser = findUserByMention(toMention, groupMetadata);

    if (!toUser) {
      // Show available participants to help user
      const availableUsers = getParticipantsList(groupMetadata)
        .slice(0, 10)
        .map(u => `• ${u.displayName}`)
        .join('\n');

      await sendMessage(sock, groupId,
        `❌ Could not find user: @${toMention}\n\n` +
        `*Available group members:*\n${availableUsers}\n\n` +
        `💡 Tip: Use first name or phone number.`
      );
      return;
    }

    const to = await getUserInfo(sock, groupMetadata, toUser.id);

    let splitwisePaymentId = null;
    let storageMode = 'MongoDB';

    // Try Splitwise if not in test mode
    if (process.env.NODE_ENV !== 'test') {
      try {
        const splitwiseHandler = getSplitwiseHandler();
        const paymentNote = command.description !== 'Expense' ? command.description : 'Payment';

        const splitwiseExpense = await splitwiseHandler.addExpense(sock, groupId, groupMetadata, {
          amount: command.amount,
          description: `💸 ${paymentNote}`,
          payerId: to.userId, // The person who was owed is marked as the "payer" in Splitwise
          splitAmongIds: [to.userId], // Only they owe themselves (net 0 effect on their balance)
        });

        splitwisePaymentId = splitwiseExpense.id;
        storageMode = 'Splitwise + MongoDB';
        logger.info({ splitwisePaymentId, groupId }, 'Payment recorded in Splitwise');
      } catch (splitwiseError) {
        logger.warn({ error: splitwiseError }, 'Splitwise unavailable, using MongoDB only');
        storageMode = 'MongoDB (Splitwise offline)';
      }
    }

    // Always save to MongoDB
    const settlement = await Settlement.create({
      groupId,
      from: {
        userId: from.userId,
        userName: from.userName
      },
      to: {
        userId: to.userId,
        userName: to.userName
      },
      amount: command.amount,
      currency: 'USD',
      note: command.description !== 'Expense' ? command.description : null,
      splitwisePaymentId
    });

    // Update related expenses in MongoDB
    await updateExpenseSettlements(groupId, from.userId, to.userId, command.amount);

    logger.info({ settlementId: settlement._id, groupId, storageMode }, 'Payment recorded');

    // Send confirmation
    const response = `
✅ *Payment Recorded*

💵 Amount: $${command.amount.toFixed(2)}
👤 From: ${from.userName}
👤 To: ${to.userName}
${command.description !== 'Expense' ? `📝 Note: ${command.description}` : ''}

Use \`@anukul balance\` to see updated balances.

${storageMode.includes('Splitwise') ? '_Payment tracked in Splitwise_' : '_Payment tracked locally_'}
    `.trim();

    await sendMessage(sock, groupId, response);
  } catch (error) {
    logger.error('Error handling settle command:', error);
    await sendMessage(sock, groupId, '❌ Failed to record payment. Please try again.');
  }
}

/**
 * Update expense settlements in MongoDB after a payment
 * Marks splits as settled and updates totals
 */
async function updateExpenseSettlements(groupId, fromUserId, toUserId, amount) {
  try {
    // Find unsettled expenses where fromUser owes toUser
    const expenses = await Expense.find({
      groupId,
      'paidBy.userId': toUserId,
      fullySettled: false,
      'splitAmong': {
        $elemMatch: {
          userId: fromUserId,
          settled: false
        }
      }
    }).sort({ createdAt: 1 }); // Oldest first

    let remainingAmount = amount;

    for (const expense of expenses) {
      if (remainingAmount <= 0) break;

      // Find the split for fromUser
      const splitIndex = expense.splitAmong.findIndex(s => s.userId === fromUserId && !s.settled);
      if (splitIndex === -1) continue;

      const split = expense.splitAmong[splitIndex];
      const amountOwed = split.amount;

      if (remainingAmount >= amountOwed) {
        // Fully settle this split
        expense.splitAmong[splitIndex].settled = true;
        expense.totalSettled += amountOwed;
        remainingAmount -= amountOwed;
      } else {
        // Partial settlement - reduce the amount owed
        expense.splitAmong[splitIndex].amount -= remainingAmount;
        expense.totalSettled += remainingAmount;
        remainingAmount = 0;
      }

      // Check if expense is fully settled
      expense.checkIfSettled();
      await expense.save();
    }

    logger.debug({ fromUserId, toUserId, amount, remainingAmount }, 'Updated expense settlements');
  } catch (error) {
    logger.error({ error }, 'Error updating expense settlements');
  }
}

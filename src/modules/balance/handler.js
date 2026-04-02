import { sendMessage } from '../../bot/messageHandler.js';
import { getSplitwiseHandler } from '../splitwise/handler.js';
import Expense from '../../models/Expense.js';
import logger from '../../utils/logger.js';

export async function handleBalanceCommand(sock, message, command) {
  const groupId = message.key.remoteJid;

  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    let balances = [];
    let recentExpenses = [];
    let source = 'MongoDB';

    // Try Splitwise first if not in test mode
    if (process.env.NODE_ENV !== 'test') {
      try {
        const splitwiseHandler = getSplitwiseHandler();
        balances = await splitwiseHandler.getGroupBalances(sock, groupId, groupMetadata);
        recentExpenses = await splitwiseHandler.getGroupExpenses(sock, groupId, groupMetadata, 5);
        source = 'Splitwise';
      } catch (splitwiseError) {
        logger.warn({ error: splitwiseError }, 'Splitwise unavailable, using MongoDB for balances');
      }
    }

    // Fallback to MongoDB if Splitwise unavailable
    if (balances.length === 0 && source === 'MongoDB') {
      const result = await calculateBalancesFromMongoDB(groupId);
      balances = result.balances;
      recentExpenses = result.recentExpenses;
    }

    if (balances.length === 0) {
      await sendMessage(sock, groupId, '✅ All settled! No pending balances.');
      return;
    }

    // Format balance summary
    let summary = '*💰 Group Balance Summary*\n\n';
    summary += '*Current Balances:*\n';

    for (const balance of balances) {
      const amount = Math.abs(balance.amount);
      const currency = balance.currency || 'USD';

      if (source === 'Splitwise') {
        // Splitwise format: total balances
        if (balance.amount > 0) {
          summary += `• ${balance.userName} is owed ${currency} ${amount.toFixed(2)}\n`;
        } else {
          summary += `• ${balance.userName} owes ${currency} ${amount.toFixed(2)}\n`;
        }
      } else {
        // MongoDB format: itemized debts
        if (balance.owesTo) {
          summary += `${balance.userName} owes ${balance.owesTo}: $${amount.toFixed(2)}\n`;
        } else if (balance.amount > 0) {
          summary += `• ${balance.userName} is owed ${currency} ${amount.toFixed(2)}\n`;
        } else {
          summary += `• ${balance.userName} owes ${currency} ${amount.toFixed(2)}\n`;
        }
      }
    }

    // Show recent expenses
    if (recentExpenses.length > 0) {
      summary += '\n*Recent Expenses:*\n';
      for (const expense of recentExpenses) {
        if (source === 'Splitwise') {
          const cost = parseFloat(expense.cost);
          const paidBy = expense.users.find(u => parseFloat(u.paid_share) > 0);
          const payerName = paidBy ? `${paidBy.user.first_name} ${paidBy.user.last_name}`.trim() : 'Unknown';
          summary += `• $${cost.toFixed(2)} - ${expense.description} (${payerName})\n`;
        } else {
          summary += `• $${expense.amount.toFixed(2)} - ${expense.description} (${expense.paidBy.userName})\n`;
        }
      }
    }

    summary += source === 'Splitwise' ? '\n_Powered by Splitwise_' : '\n_Local data_';

    await sendMessage(sock, groupId, summary.trim());
  } catch (error) {
    logger.error('Error handling balance command:', error);
    await sendMessage(sock, groupId, '❌ Failed to get balances. Please try again.');
  }
}

/**
 * Calculate balances from MongoDB when Splitwise is unavailable
 * Returns itemized breakdown of who owes whom
 */
async function calculateBalancesFromMongoDB(groupId) {
  // Get all unsettled expenses
  const expenses = await Expense.find({ groupId, fullySettled: false })
    .sort({ createdAt: -1 })
    .lean();

  // Build debt map: debtor -> creditor -> amount
  const debtMap = new Map(); // userId -> Map(creditorId -> amount)
  const userNames = new Map();

  for (const expense of expenses) {
    const payerId = expense.paidBy.userId;
    const payerName = expense.paidBy.userName;
    userNames.set(payerId, payerName);

    // Each person who hasn't settled owes the payer their share
    for (const split of expense.splitAmong) {
      userNames.set(split.userId, split.userName);

      // Skip if already settled or if it's the payer themselves
      if (split.settled || split.userId === payerId) {
        continue;
      }

      // Track debt: split.userId owes payerId the split.amount
      if (!debtMap.has(split.userId)) {
        debtMap.set(split.userId, new Map());
      }

      const userDebts = debtMap.get(split.userId);
      const currentDebt = userDebts.get(payerId) || 0;
      userDebts.set(payerId, currentDebt + split.amount);
    }
  }

  // Convert to itemized balance array
  const balances = [];
  for (const [debtorId, creditors] of debtMap.entries()) {
    const debtorName = userNames.get(debtorId);

    for (const [creditorId, amount] of creditors.entries()) {
      if (Math.abs(amount) > 0.01) { // Filter negligible amounts
        balances.push({
          userId: debtorId,
          userName: debtorName,
          owesTo: userNames.get(creditorId),
          amount: -amount, // Negative because it's a debt
          currency: 'USD'
        });
      }
    }
  }

  // Get recent expenses for display
  const recentExpenses = expenses.slice(0, 5);

  return { balances, recentExpenses };
}

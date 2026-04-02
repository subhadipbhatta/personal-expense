/**
 * Build context for AI from database and group metadata
 */

import Expense from '../models/Expense.js';
import { getUserInfo } from '../utils/userHelpers.js';
import logger from '../utils/logger.js';

/**
 * Build complete group context for AI
 *
 * @param {object} sock - WhatsApp socket
 * @param {string} groupId - Group ID
 * @returns {Promise<object>} Group context object
 */
export async function buildGroupContext(sock, groupId) {
  try {
    // Get group metadata
    const groupMetadata = await sock.groupMetadata(groupId);

    // Get member names
    const members = await Promise.all(
      groupMetadata.participants.map(async (p) => {
        const userInfo = await getUserInfo(sock, groupMetadata, p.id);
        return userInfo.userName;
      })
    );

    // Get recent expenses (last 10)
    const expenses = await Expense.find({ groupId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Format expenses for context
    const formattedExpenses = expenses.map(e => ({
      description: e.description,
      amount: e.amount,
      paidBy: e.paidBy.userName,
      splitAmong: e.splitAmong.map(s => s.userName),
      settled: e.fullySettled,
      date: e.createdAt
    }));

    // Calculate current balances
    const balances = await calculateBalances(groupId);

    return {
      groupId,
      members,
      expenses: formattedExpenses,
      balances
    };

  } catch (error) {
    logger.error({ error, groupId }, 'Error building group context');
    return {
      groupId,
      members: [],
      expenses: [],
      balances: {}
    };
  }
}

/**
 * Calculate who owes whom
 *
 * @param {string} groupId - Group ID
 * @returns {Promise<object>} Balance map
 */
async function calculateBalances(groupId) {
  try {
    const expenses = await Expense.find({
      groupId,
      fullySettled: false
    });

    const balances = {};

    for (const expense of expenses) {
      const payer = expense.paidBy.userName;

      for (const split of expense.splitAmong) {
        if (split.settled || split.userName === payer) continue;

        const key = `${split.userName} → ${payer}`;
        balances[key] = (balances[key] || 0) + split.amount;
      }
    }

    return balances;

  } catch (error) {
    logger.error({ error }, 'Error calculating balances');
    return {};
  }
}

/**
 * Get sender name from group
 *
 * @param {object} sock - WhatsApp socket
 * @param {object} groupMetadata - Group metadata
 * @param {string} senderId - Sender WhatsApp ID
 * @returns {Promise<string>} Sender name
 */
export async function getSenderName(sock, groupMetadata, senderId) {
  try {
    const userInfo = await getUserInfo(sock, groupMetadata, senderId);
    return userInfo.userName;
  } catch (error) {
    logger.error({ error }, 'Error getting sender name');
    return 'Unknown';
  }
}

import { getSplitwiseClient } from './client.js';
import { getSplitwiseMapper } from './mapper.js';
import { getUserInfo } from '../../utils/userHelpers.js';
import logger from '../../utils/logger.js';

/**
 * SplitwiseHandler
 * Orchestrates WhatsApp bot integration with Splitwise
 */
class SplitwiseHandler {
  constructor() {
    this.client = getSplitwiseClient();
    this.mapper = getSplitwiseMapper();
  }

  /**
   * Initialize Splitwise integration
   * Starts the MCP server
   */
  async initialize() {
    try {
      await this.client.start();
      logger.info('Splitwise integration initialized');
    } catch (error) {
      logger.error('Failed to initialize Splitwise integration:', error);
      throw error;
    }
  }

  /**
   * Shutdown Splitwise integration
   */
  async shutdown() {
    try {
      await this.client.stop();
      logger.info('Splitwise integration shut down');
    } catch (error) {
      logger.error('Error shutting down Splitwise integration:', error);
    }
  }

  /**
   * Ensure WhatsApp group is mapped to Splitwise group
   * Creates Splitwise group if needed
   */
  async ensureGroupMapping(sock, groupId, groupMetadata) {
    try {
      // Check if mapping exists
      let mapping = await this.mapper.getGroupMapping(groupId);
      if (mapping) {
        logger.debug(`Group already mapped: WA ${groupId} -> SW ${mapping.splitwiseGroupId}`);
        return mapping.splitwiseGroupId;
      }

      // Create new Splitwise group
      const groupName = groupMetadata.subject || 'WhatsApp Group';
      logger.info(`Creating new Splitwise group: ${groupName}`);

      const result = await this.client.createGroup(groupName);

      // MCP returns data in structuredContent field
      const groupData = result?.structuredContent || {};
      const group = groupData.group || result.group; // Fallback for backward compatibility
      const splitwiseGroupId = group.id;

      // Save mapping
      await this.mapper.createGroupMapping(groupId, splitwiseGroupId, groupName);

      logger.info(`Created Splitwise group ${splitwiseGroupId} for WhatsApp group ${groupId}`);
      return splitwiseGroupId;
    } catch (error) {
      logger.error('Error ensuring group mapping:', error);
      throw error;
    }
  }

  /**
   * Ensure WhatsApp users are mapped to Splitwise users
   * Returns array of Splitwise user IDs
   */
  async ensureUserMappings(sock, groupMetadata, whatsappUserIds) {
    try {
      // Get existing mappings
      const existingMappings = await this.mapper.getUserMappings(whatsappUserIds);
      const existingMap = new Map(
        existingMappings.map(m => [m.whatsappUserId, m.splitwiseUserId])
      );

      // Find unmapped users
      const unmappedUserIds = whatsappUserIds.filter(id => !existingMap.has(id));

      if (unmappedUserIds.length > 0) {
        logger.info(`Need to map ${unmappedUserIds.length} users to Splitwise`);

        // For unmapped users, we need to either:
        // 1. Find them in Splitwise by email/phone
        // 2. Create placeholder entries
        // For now, we'll create placeholder entries with the current user as owner

        const currentUserResult = await this.client.getCurrentUser();

        // MCP returns data in structuredContent field
        const userData = currentUserResult?.structuredContent || {};
        const currentUser = userData.user || currentUserResult.user; // Fallback for backward compatibility

        const newMappings = [];

        for (const waUserId of unmappedUserIds) {
          const userInfo = await getUserInfo(sock, groupMetadata, waUserId);

          // Use current user's Splitwise ID as placeholder
          // In production, you'd want to invite users or look them up
          newMappings.push({
            whatsappUserId: waUserId,
            splitwiseUserId: currentUser.id,
            firstName: userInfo.displayName.split(' ')[0],
            lastName: userInfo.displayName.split(' ').slice(1).join(' ') || '',
          });
        }

        if (newMappings.length > 0) {
          await this.mapper.createUserMappings(newMappings);
        }

        // Refresh mappings
        const allMappings = await this.mapper.getUserMappings(whatsappUserIds);
        return allMappings.map(m => m.splitwiseUserId);
      }

      return existingMappings.map(m => m.splitwiseUserId);
    } catch (error) {
      logger.error('Error ensuring user mappings:', error);
      throw error;
    }
  }

  /**
   * Add expense to Splitwise
   */
  async addExpense(sock, groupId, groupMetadata, expenseData) {
    try {
      // Ensure group is mapped
      const splitwiseGroupId = await this.ensureGroupMapping(sock, groupId, groupMetadata);

      // Ensure users are mapped
      const allUserIds = [expenseData.payerId, ...expenseData.splitAmongIds];
      await this.ensureUserMappings(sock, groupMetadata, allUserIds);

      // Get payer's Splitwise ID
      const payerMapping = await this.mapper.getUserMapping(expenseData.payerId);
      const payerSplitwise = payerMapping.splitwiseUserId;

      // Get split users' Splitwise IDs
      const splitMappings = await this.mapper.getUserMappings(expenseData.splitAmongIds);
      const splitUsersSplitwise = splitMappings.map(m => m.splitwiseUserId);

      // Calculate split amounts
      const splitAmount = expenseData.amount / expenseData.splitAmongIds.length;

      // Build users array for Splitwise
      const users = [];

      // Add payer
      users.push({
        userId: payerSplitwise,
        paidShare: expenseData.amount,
        owedShare: splitAmount,
      });

      // Add other split users
      splitUsersSplitwise.forEach(userId => {
        if (userId !== payerSplitwise) {
          users.push({
            userId,
            paidShare: 0,
            owedShare: splitAmount,
          });
        }
      });

      // Create expense in Splitwise
      const result = await this.client.createExpense({
        cost: expenseData.amount,
        description: expenseData.description,
        groupId: splitwiseGroupId,
        users,
        splitEqually: true,
      });

      // MCP returns data in structuredContent field
      const expenseData_ = result?.structuredContent || {};
      const expenses = expenseData_.expenses || result.expenses; // Fallback for backward compatibility

      logger.info(`Created Splitwise expense ${expenses[0].id}`);
      return expenses[0];
    } catch (error) {
      logger.error('Error adding expense to Splitwise:', error);
      throw error;
    }
  }

  /**
   * Get group balances from Splitwise
   */
  async getGroupBalances(sock, groupId, groupMetadata) {
    try {
      // Ensure group is mapped
      const splitwiseGroupId = await this.ensureGroupMapping(sock, groupId, groupMetadata);

      // Get group details from Splitwise
      const result = await this.client.getGroup(splitwiseGroupId);

      // MCP returns data in structuredContent field
      const groupData = result?.structuredContent || {};
      const group = groupData.group || {};

      logger.debug({ groupId: splitwiseGroupId, hasMembers: !!group.members }, 'Retrieved group from Splitwise');

      // Extract balances
      const balances = [];
      if (group.members) {
        group.members.forEach(member => {
          if (member.balance && member.balance.length > 0) {
            member.balance.forEach(bal => {
              const amount = parseFloat(bal.amount);
              if (amount !== 0) {
                balances.push({
                  userId: member.id,
                  userName: `${member.first_name} ${member.last_name}`.trim(),
                  amount,
                  currency: bal.currency_code,
                });
              }
            });
          }
        });
      }

      return balances;
    } catch (error) {
      logger.error('Error getting group balances:', error);
      throw error;
    }
  }

  /**
   * Get recent expenses for a group
   */
  async getGroupExpenses(sock, groupId, groupMetadata, limit = 10) {
    try {
      const splitwiseGroupId = await this.ensureGroupMapping(sock, groupId, groupMetadata);
      const result = await this.client.getExpenses(splitwiseGroupId, limit);

      // MCP returns data in structuredContent field
      const expenseData = result?.structuredContent || {};
      const expenses = expenseData.expenses || result.expenses || []; // Fallback for backward compatibility

      return expenses;
    } catch (error) {
      logger.error('Error getting group expenses:', error);
      throw error;
    }
  }
}

// Singleton instance
let handlerInstance = null;

export function getSplitwiseHandler() {
  if (!handlerInstance) {
    handlerInstance = new SplitwiseHandler();
  }
  return handlerInstance;
}

export default SplitwiseHandler;

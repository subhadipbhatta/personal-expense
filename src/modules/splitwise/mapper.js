import mongoose from 'mongoose';
import logger from '../../utils/logger.js';

/**
 * WhatsApp to Splitwise Group Mapping Schema
 * Maps WhatsApp group IDs to Splitwise group IDs
 */
const groupMappingSchema = new mongoose.Schema({
  whatsappGroupId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  splitwiseGroupId: {
    type: Number,
    required: true,
  },
  splitwiseGroupName: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastSyncedAt: Date,
});

/**
 * WhatsApp to Splitwise User Mapping Schema
 * Maps WhatsApp user IDs (phone numbers) to Splitwise user IDs
 */
const userMappingSchema = new mongoose.Schema({
  whatsappUserId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  splitwiseUserId: {
    type: Number,
    required: true,
  },
  splitwiseEmail: String,
  firstName: String,
  lastName: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastSyncedAt: Date,
});

const GroupMapping = mongoose.model('GroupMapping', groupMappingSchema);
const UserMapping = mongoose.model('UserMapping', userMappingSchema);

/**
 * SplitwiseMapper
 * Manages mappings between WhatsApp and Splitwise entities
 */
class SplitwiseMapper {
  /**
   * Get or create group mapping
   */
  async getGroupMapping(whatsappGroupId) {
    try {
      const mapping = await GroupMapping.findOne({ whatsappGroupId });
      return mapping;
    } catch (error) {
      logger.error('Error getting group mapping:', error);
      throw error;
    }
  }

  /**
   * Create group mapping
   */
  async createGroupMapping(whatsappGroupId, splitwiseGroupId, splitwiseGroupName) {
    try {
      const mapping = await GroupMapping.create({
        whatsappGroupId,
        splitwiseGroupId,
        splitwiseGroupName,
        lastSyncedAt: new Date(),
      });
      logger.info(`Created group mapping: WA ${whatsappGroupId} -> SW ${splitwiseGroupId}`);
      return mapping;
    } catch (error) {
      logger.error('Error creating group mapping:', error);
      throw error;
    }
  }

  /**
   * Update group mapping sync time
   */
  async updateGroupSyncTime(whatsappGroupId) {
    try {
      await GroupMapping.updateOne(
        { whatsappGroupId },
        { lastSyncedAt: new Date() }
      );
    } catch (error) {
      logger.error('Error updating group sync time:', error);
    }
  }

  /**
   * Get user mapping
   */
  async getUserMapping(whatsappUserId) {
    try {
      const mapping = await UserMapping.findOne({ whatsappUserId });
      return mapping;
    } catch (error) {
      logger.error('Error getting user mapping:', error);
      throw error;
    }
  }

  /**
   * Get multiple user mappings
   */
  async getUserMappings(whatsappUserIds) {
    try {
      const mappings = await UserMapping.find({
        whatsappUserId: { $in: whatsappUserIds },
      });
      return mappings;
    } catch (error) {
      logger.error('Error getting user mappings:', error);
      throw error;
    }
  }

  /**
   * Create user mapping
   */
  async createUserMapping(whatsappUserId, splitwiseUserId, userInfo = {}) {
    try {
      const mapping = await UserMapping.create({
        whatsappUserId,
        splitwiseUserId,
        splitwiseEmail: userInfo.email,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        lastSyncedAt: new Date(),
      });
      logger.info(`Created user mapping: WA ${whatsappUserId} -> SW ${splitwiseUserId}`);
      return mapping;
    } catch (error) {
      logger.error('Error creating user mapping:', error);
      throw error;
    }
  }

  /**
   * Batch create user mappings
   */
  async createUserMappings(mappings) {
    try {
      const docs = mappings.map(m => ({
        whatsappUserId: m.whatsappUserId,
        splitwiseUserId: m.splitwiseUserId,
        splitwiseEmail: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        lastSyncedAt: new Date(),
      }));

      const result = await UserMapping.insertMany(docs, { ordered: false });
      logger.info(`Created ${result.length} user mappings`);
      return result;
    } catch (error) {
      // Ignore duplicate key errors (user already mapped)
      if (error.code !== 11000) {
        logger.error('Error batch creating user mappings:', error);
        throw error;
      }
    }
  }

  /**
   * Get unmapped users from a list
   */
  async getUnmappedUsers(whatsappUserIds) {
    try {
      const mappings = await UserMapping.find({
        whatsappUserId: { $in: whatsappUserIds },
      }).select('whatsappUserId');

      const mappedIds = new Set(mappings.map(m => m.whatsappUserId));
      return whatsappUserIds.filter(id => !mappedIds.has(id));
    } catch (error) {
      logger.error('Error getting unmapped users:', error);
      throw error;
    }
  }

  /**
   * Delete group mapping
   */
  async deleteGroupMapping(whatsappGroupId) {
    try {
      await GroupMapping.deleteOne({ whatsappGroupId });
      logger.info(`Deleted group mapping for WA ${whatsappGroupId}`);
    } catch (error) {
      logger.error('Error deleting group mapping:', error);
      throw error;
    }
  }
}

// Singleton instance
let mapperInstance = null;

export function getSplitwiseMapper() {
  if (!mapperInstance) {
    mapperInstance = new SplitwiseMapper();
  }
  return mapperInstance;
}

export { GroupMapping, UserMapping };
export default SplitwiseMapper;

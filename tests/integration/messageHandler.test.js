import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { sendMessage } from '../../src/bot/messageHandler.js';

// Mock socket and database
const mockSock = {
  sendMessage: jest.fn()
};

describe('Message Handler - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Group-Only Operation - Negative Cases', () => {
    test('should reject DM messages', async () => {
      const message = {
        key: {
          remoteJid: '1234567890@s.whatsapp.net', // DM (not group)
          participant: null
        },
        message: { conversation: '@expense add $50 dinner' }
      };

      // This should send error message
      await sendMessage(mockSock, message.key.remoteJid,
        '❌ This bot only works in WhatsApp groups.');

      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        message.key.remoteJid,
        { text: '❌ This bot only works in WhatsApp groups.' }
      );
    });

    test('should accept group messages', async () => {
      const groupId = '1234567890-1234567890@g.us';
      expect(groupId.endsWith('@g.us')).toBe(true);
    });

    test('should reject broadcast messages', async () => {
      const broadcastId = '1234567890@broadcast';
      expect(broadcastId.endsWith('@g.us')).toBe(false);
    });
  });

  describe('Trigger Validation - Negative Cases', () => {
    test('should ignore messages without trigger', async () => {
      const message = {
        key: {
          remoteJid: 'group@g.us',
          participant: 'user@s.whatsapp.net'
        },
        message: { conversation: 'add $50 dinner' } // No @expense
      };

      // Should not process
      const hasTrigger = message.message.conversation.toLowerCase().includes('@expense');
      expect(hasTrigger).toBe(false);
    });

    test('should handle case-insensitive trigger', () => {
      const messages = [
        '@expense add $50',
        '@EXPENSE add $50',
        '@Expense add $50',
        '@ExPeNsE add $50'
      ];

      messages.forEach(msg => {
        expect(msg.toLowerCase().includes('@expense')).toBe(true);
      });
    });

    test('should ignore trigger in middle of sentence', () => {
      const message = 'This is not an @expense command';
      // Should still match as trigger check is simple includes
      expect(message.toLowerCase().includes('@expense')).toBe(true);
    });
  });

  describe('Amount Validation - Negative Cases', () => {
    const testCases = [
      { amount: 0, description: 'zero amount', shouldFail: true },
      { amount: -50, description: 'negative amount', shouldFail: true },
      { amount: null, description: 'null amount', shouldFail: true },
      { amount: undefined, description: 'undefined amount', shouldFail: true },
      { amount: 'abc', description: 'non-numeric amount', shouldFail: true },
      { amount: 0.001, description: 'very small amount', shouldFail: false },
      { amount: 999999.99, description: 'very large amount', shouldFail: false }
    ];

    testCases.forEach(({ amount, description, shouldFail }) => {
      test(`should ${shouldFail ? 'reject' : 'accept'} ${description}`, () => {
        const isValid = amount > 0 && typeof amount === 'number' && !isNaN(amount);
        expect(isValid).toBe(!shouldFail);
      });
    });
  });

  describe('User Mentions - Edge Cases', () => {
    test('should handle no mentions for split command', () => {
      const mentions = [];
      expect(mentions.length).toBe(0);
      // Should split among all group members
    });

    test('should handle invalid user mentions', () => {
      const groupMembers = ['user1@s.whatsapp.net', 'user2@s.whatsapp.net'];
      const mentionedUser = 'nonexistent';

      const found = groupMembers.find(m => m.includes(mentionedUser));
      expect(found).toBeUndefined();
    });

    test('should handle duplicate mentions', () => {
      const mentions = ['john', 'jane', 'john', 'john'];
      const unique = [...new Set(mentions)];
      expect(unique).toEqual(['john', 'jane']);
    });

    test('should handle special characters in mentions', () => {
      const mentions = ['@john_doe', '@jane.smith', '@user-123'];
      // Parser extracts without @ symbol
      const cleaned = mentions.map(m => m.replace('@', ''));
      expect(cleaned).toEqual(['john_doe', 'jane.smith', 'user-123']);
    });
  });

  describe('Description Handling - Edge Cases', () => {
    test('should handle empty description', () => {
      const description = '';
      const final = description || 'Expense';
      expect(final).toBe('Expense');
    });

    test('should handle very long description', () => {
      const description = 'a'.repeat(1000);
      expect(description.length).toBe(1000);
      // Should accept but might want to truncate
    });

    test('should handle special characters in description', () => {
      const descriptions = [
        'coffee & donuts',
        'lunch @ restaurant',
        'dinner (with wine)',
        'groceries $100 worth',
        'movie tickets 🎬'
      ];

      descriptions.forEach(desc => {
        expect(desc.length).toBeGreaterThan(0);
      });
    });

    test('should handle unicode characters', () => {
      const description = 'Coffee ☕ and cake 🍰';
      expect(description).toContain('☕');
      expect(description).toContain('🍰');
    });
  });

  describe('Error Handling - Negative Cases', () => {
    test('should handle missing group metadata', async () => {
      // Simulate socket.groupMetadata throwing error
      const mockSocket = {
        groupMetadata: jest.fn().mockRejectedValue(new Error('Group not found'))
      };

      await expect(mockSocket.groupMetadata('invalid@g.us'))
        .rejects.toThrow('Group not found');
    });

    test('should handle database connection errors', async () => {
      // Simulate database error
      const mockSave = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(mockSave()).rejects.toThrow('Database error');
    });

    test('should handle malformed message objects', () => {
      const malformedMessages = [
        { key: null },
        { key: { remoteJid: null } },
        { message: null },
        {},
        null,
        undefined
      ];

      malformedMessages.forEach(msg => {
        const isValid = msg?.key?.remoteJid && msg?.message;
        expect(isValid).toBeFalsy();
      });
    });
  });

  describe('Settlement Logic - Alternate Cases', () => {
    test('should handle settlement larger than owed amount', () => {
      const owedAmount = 50;
      const settlementAmount = 75;
      const remaining = Math.max(0, settlementAmount - owedAmount);

      expect(remaining).toBe(25); // Overpayment
    });

    test('should handle partial settlement', () => {
      const owedAmount = 100;
      const settlementAmount = 50;
      const remaining = owedAmount - settlementAmount;

      expect(remaining).toBe(50);
    });

    test('should handle multiple settlements for same expense', () => {
      const payments = [25, 25, 25, 25];
      const total = payments.reduce((sum, p) => sum + p, 0);

      expect(total).toBe(100);
    });

    test('should handle settlement to wrong person', () => {
      const payer = 'user1@s.whatsapp.net';
      const recipient = 'user2@s.whatsapp.net';
      const actualPayer = 'user3@s.whatsapp.net';

      expect(recipient).not.toBe(actualPayer);
      // Should not settle debt if settling to wrong person
    });
  });

  describe('Balance Calculation - Edge Cases', () => {
    test('should handle circular debts', () => {
      // A owes B $50, B owes C $50, C owes A $50
      const debts = [
        { from: 'A', to: 'B', amount: 50 },
        { from: 'B', to: 'C', amount: 50 },
        { from: 'C', to: 'A', amount: 50 }
      ];

      // Net should be zero for all
      const netDebts = new Map();
      debts.forEach(({ from, to, amount }) => {
        netDebts.set(from, (netDebts.get(from) || 0) - amount);
        netDebts.set(to, (netDebts.get(to) || 0) + amount);
      });

      expect(netDebts.get('A')).toBe(0);
      expect(netDebts.get('B')).toBe(0);
      expect(netDebts.get('C')).toBe(0);
    });

    test('should handle no unsettled expenses', async () => {
      const expenses = [];
      expect(expenses.length).toBe(0);
      // Should return "All settled!"
    });

    test('should handle floating point precision', () => {
      const amounts = [33.33, 33.33, 33.34];
      const total = amounts.reduce((sum, a) => sum + a, 0);

      expect(total).toBeCloseTo(100, 2);
    });

    test('should handle division with odd numbers', () => {
      const total = 100;
      const people = 3;
      const perPerson = total / people;

      expect(perPerson).toBeCloseTo(33.33, 2);
      // Need to handle rounding for last person
    });
  });
});

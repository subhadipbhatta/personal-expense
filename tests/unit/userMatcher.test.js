import { describe, test, expect } from '@jest/globals';
import { findUserByMention, getUserNameOptions, getParticipantsList } from '../../src/utils/userMatcher.js';

describe('User Matcher - Unit Tests', () => {
  // Mock group metadata
  const mockGroupMetadata = {
    participants: [
      {
        id: '1234567890@s.whatsapp.net',
        notify: 'John Doe',
        name: 'Johnny',
        verifiedName: null,
        pushName: 'JD'
      },
      {
        id: '9876543210@s.whatsapp.net',
        notify: 'Jane Smith',
        name: null,
        verifiedName: null,
        pushName: 'Jane'
      },
      {
        id: '5555555555@s.whatsapp.net',
        notify: null,
        name: 'Bob Builder',
        verifiedName: null,
        pushName: null
      },
      {
        id: '1111111111@s.whatsapp.net',
        notify: null,
        name: null,
        verifiedName: 'Alice Corp',
        pushName: null
      }
    ]
  };

  describe('Positive Cases - Exact Matches', () => {
    test('should match by exact notify name (case insensitive)', () => {
      const result = findUserByMention('john doe', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('1234567890@s.whatsapp.net');
    });

    test('should match by exact name field', () => {
      const result = findUserByMention('bob builder', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('5555555555@s.whatsapp.net');
    });

    test('should match by exact verifiedName', () => {
      const result = findUserByMention('alice corp', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('1111111111@s.whatsapp.net');
    });
  });

  describe('Positive Cases - Partial Matches', () => {
    test('should match by first name only', () => {
      const result = findUserByMention('john', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('John Doe');
    });

    test('should match by partial name', () => {
      const result = findUserByMention('jane', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('Jane Smith');
    });

    test('should match name that starts with mention', () => {
      const result = findUserByMention('bob', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.name).toBe('Bob Builder');
    });

    test('should match by contained substring', () => {
      const result = findUserByMention('smith', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('Jane Smith');
    });
  });

  describe('Phone Number Matching', () => {
    test('should match by full phone number', () => {
      const result = findUserByMention('1234567890', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('1234567890@s.whatsapp.net');
    });

    test('should match by partial phone number', () => {
      const result = findUserByMention('9876', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('9876543210@s.whatsapp.net');
    });

    test('should match phone with country code format', () => {
      const result = findUserByMention('5555', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.id).toBe('5555555555@s.whatsapp.net');
    });
  });

  describe('Case Insensitivity', () => {
    test('should match uppercase mention', () => {
      const result = findUserByMention('JOHN', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('John Doe');
    });

    test('should match mixed case mention', () => {
      const result = findUserByMention('JaNe', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('Jane Smith');
    });

    test('should handle whitespace', () => {
      const result = findUserByMention('  john  ', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.notify).toBe('John Doe');
    });
  });

  describe('Negative Cases - No Match', () => {
    test('should return null for non-existent user', () => {
      const result = findUserByMention('charlie', mockGroupMetadata);
      expect(result).toBeNull();
    });

    test('should return null for invalid phone', () => {
      const result = findUserByMention('0000000000', mockGroupMetadata);
      expect(result).toBeNull();
    });

    test('should return null for empty mention', () => {
      const result = findUserByMention('', mockGroupMetadata);
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    test('should match nickname over full name', () => {
      const result = findUserByMention('johnny', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.name).toBe('Johnny');
    });

    test('should match pushName if available', () => {
      const result = findUserByMention('jd', mockGroupMetadata);
      expect(result).not.toBeNull();
      expect(result.pushName).toBe('JD');
    });

    test('should handle special characters in names', () => {
      const specialMeta = {
        participants: [{
          id: '1111@s.whatsapp.net',
          notify: "O'Brien",
          name: null
        }]
      };
      const result = findUserByMention("o'brien", specialMeta);
      expect(result).not.toBeNull();
    });
  });

  describe('Helper Functions', () => {
    test('getUserNameOptions should return all name fields', () => {
      const participant = mockGroupMetadata.participants[0];
      const options = getUserNameOptions(participant);

      expect(options.notify).toBe('John Doe');
      expect(options.name).toBe('Johnny');
      expect(options.pushName).toBe('JD');
      expect(options.phoneNumber).toBe('1234567890');
    });

    test('getParticipantsList should format all participants', () => {
      const list = getParticipantsList(mockGroupMetadata);

      expect(list).toHaveLength(4);
      expect(list[0].displayName).toContain('John Doe');
      expect(list[0].phoneNumber).toBe('1234567890');
    });

    test('getParticipantsList should handle missing names', () => {
      const list = getParticipantsList(mockGroupMetadata);
      const aliceEntry = list.find(p => p.phoneNumber === '1111111111');

      expect(aliceEntry.displayName).toBe('Alice Corp');
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle contacts saved with different names', () => {
      // User's contact name is "Mom" but WhatsApp name is "Mary Johnson"
      const realWorldMeta = {
        participants: [{
          id: '1234567890@s.whatsapp.net',
          notify: 'Mom',  // Contact name
          name: 'Mary Johnson',  // WhatsApp profile
          pushName: 'Mary'
        }]
      };

      // Should match by contact name (notify)
      expect(findUserByMention('mom', realWorldMeta)).not.toBeNull();
      // Should also match by WhatsApp name
      expect(findUserByMention('mary', realWorldMeta)).not.toBeNull();
      // Should match by full name
      expect(findUserByMention('mary johnson', realWorldMeta)).not.toBeNull();
    });

    test('should handle unsaved numbers', () => {
      const unsavedMeta = {
        participants: [{
          id: '9999999999@s.whatsapp.net',
          notify: null,
          name: null,
          pushName: 'Unknown User'
        }]
      };

      // Should match by phone number
      expect(findUserByMention('9999999999', unsavedMeta)).not.toBeNull();
      // Should match by pushName
      expect(findUserByMention('unknown', unsavedMeta)).not.toBeNull();
    });
  });
});

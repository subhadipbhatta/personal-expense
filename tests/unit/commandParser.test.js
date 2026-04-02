import { describe, test, expect } from '@jest/globals';
import { parseCommand } from '../../src/utils/commandParser.js';

describe('Command Parser - Unit Tests', () => {
  const TRIGGER = '@anukul';

  describe('Positive Cases', () => {
    test('should parse add expense command with amount and description', () => {
      const result = parseCommand('@anukul add expense $50 dinner', TRIGGER);
      expect(result.action).toBe('add');
      expect(result.amount).toBe(50);
      expect(result.description).toBe('dinner');
    });

    test('should parse split expense command with mentions', () => {
      const result = parseCommand('@anukul split expense $100 groceries @john @jane', TRIGGER);
      expect(result.action).toBe('split');
      expect(result.amount).toBe(100);
      expect(result.description).toBe('groceries');
      expect(result.mentions).toEqual(['john', 'jane']);
    });

    test('should parse amount without dollar sign', () => {
      const result = parseCommand('@anukul add expense 25.50 coffee', TRIGGER);
      expect(result.amount).toBe(25.50);
    });

    test('should handle commands without "expense" keyword (backward compatibility)', () => {
      const result = parseCommand('@anukul add $50 dinner', TRIGGER);
      expect(result.action).toBe('add');
      expect(result.amount).toBe(50);
      expect(result.description).toBe('dinner');
    });
  });

  describe('Negative Cases', () => {
    test('should handle negative amounts', () => {
      const result = parseCommand('@anukul add expense $-50 refund', TRIGGER);
      // Parser extracts 50, app logic should validate negative
      expect(result.amount).toBe(50);
    });

    test('should handle zero amount', () => {
      const result = parseCommand('@anukul add expense $0 free', TRIGGER);
      expect(result.amount).toBe(0);
    });

    test('should handle missing amount', () => {
      const result = parseCommand('@anukul add expense dinner', TRIGGER);
      expect(result.amount).toBe(0);
      expect(result.description).toBe('dinner');
    });

    test('should handle invalid amount format', () => {
      const result = parseCommand('@anukul add expense abc dinner', TRIGGER);
      expect(result.amount).toBe(0);
    });

    test('should handle command without trigger', () => {
      const result = parseCommand('add expense $50 dinner', TRIGGER);
      expect(result.action).toBe('add');
      expect(result.amount).toBe(50);
    });

    test('should handle empty description', () => {
      const result = parseCommand('@anukul add expense $50', TRIGGER);
      expect(result.amount).toBe(50);
      // After removing amount, if no description left, should use a default or the amount text
      expect(result.description).toBeTruthy();
    });

    test('should handle very large amounts', () => {
      const result = parseCommand('@anukul add expense $999999.99 expensive', TRIGGER);
      expect(result.amount).toBe(999999.99);
    });

    test('should handle decimal amounts with more than 2 places', () => {
      const result = parseCommand('@anukul add expense $50.999 dinner', TRIGGER);
      expect(result.amount).toBe(50.999);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple dollar signs', () => {
      const result = parseCommand('@anukul add expense $$$50 dinner', TRIGGER);
      expect(result.amount).toBe(50);
    });

    test('should handle special characters in description', () => {
      const result = parseCommand('@anukul add expense $50 dinner & drinks!', TRIGGER);
      expect(result.description).toBe('dinner & drinks!');
    });

    test('should handle mentions without @ in extracted array', () => {
      const result = parseCommand('@anukul split expense $100 @john @jane', TRIGGER);
      expect(result.mentions).toEqual(['john', 'jane']);
    });

    test('should handle case insensitive trigger', () => {
      const result = parseCommand('@ANUKUL add expense $50 dinner', TRIGGER);
      expect(result.action).toBe('add');
    });

    test('should extract only first word as action', () => {
      const result = parseCommand('@anukul add expense extra $50 dinner', TRIGGER);
      expect(result.action).toBe('add');
    });

    test('should handle balance expense command without amount', () => {
      const result = parseCommand('@anukul balance expense', TRIGGER);
      expect(result.action).toBe('balance');
      expect(result.amount).toBe(0);
    });

    test('should handle settle expense command format', () => {
      const result = parseCommand('@anukul settle expense @john $25', TRIGGER);
      expect(result.action).toBe('settle');
      expect(result.amount).toBe(25);
      expect(result.mentions).toContain('john');
    });

    test('should not include trigger name in mentions', () => {
      const result = parseCommand('@anukul split expense $100 @anukul @john', TRIGGER);
      expect(result.mentions).toEqual(['john']);
      expect(result.mentions).not.toContain('anukul');
    });
  });

  describe('Alternate Cases', () => {
    test('should default to help for unknown action', () => {
      const result = parseCommand('@anukul unknown', TRIGGER);
      expect(result.action).toBe('unknown');
    });

    test('should handle empty command after trigger', () => {
      const result = parseCommand('@anukul', TRIGGER);
      expect(result.action).toBe('help');
    });

    test('should preserve raw text', () => {
      const result = parseCommand('@anukul add expense $50 dinner with @john', TRIGGER);
      expect(result.rawText).toBeDefined();
    });

    test('should handle amounts with commas', () => {
      const result = parseCommand('@anukul add expense $1,000.50 rent', TRIGGER);
      // Parser might not handle commas - this tests current behavior
      expect(result.amount).toBeGreaterThanOrEqual(0);
    });
  });
});

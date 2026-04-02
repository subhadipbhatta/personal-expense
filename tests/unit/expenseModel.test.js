import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import Expense from '../../src/models/Expense.js';

describe('Expense Model - Unit Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-test');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Expense.deleteMany({});
  });

  describe('Positive Cases', () => {
    test('should create expense with valid data', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test expense',
        amount: 100,
        paidBy: { userId: 'user1@s.whatsapp.net', userName: 'User 1' },
        splitAmong: [
          { userId: 'user1@s.whatsapp.net', userName: 'User 1', amount: 50, settled: true },
          { userId: 'user2@s.whatsapp.net', userName: 'User 2', amount: 50, settled: false }
        ]
      });

      const saved = await expense.save();
      expect(saved._id).toBeDefined();
      expect(saved.currency).toBe('USD');
      expect(saved.fullySettled).toBe(false);
    });

    test('should calculate settlement status correctly', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1@s.whatsapp.net', userName: 'User 1' },
        splitAmong: [
          { userId: 'user1@s.whatsapp.net', userName: 'User 1', amount: 50, settled: true },
          { userId: 'user2@s.whatsapp.net', userName: 'User 2', amount: 50, settled: true }
        ],
        totalSettled: 100
      });

      expect(expense.checkIfSettled()).toBe(true);
      expect(expense.fullySettled).toBe(true);
    });
  });

  describe('Negative Cases', () => {
    test('should fail without required groupId', async () => {
      const expense = new Expense({
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      await expect(expense.save()).rejects.toThrow();
    });

    test('should fail without paidBy', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100
      });

      await expect(expense.save()).rejects.toThrow();
    });

    test('should fail with negative amount', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: -50,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      await expect(expense.save()).rejects.toThrow();
    });

    test('should fail with empty description', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: '',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      await expect(expense.save()).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should reject zero amount', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Free item',
        amount: 0,
        paidBy: { userId: 'user1', userName: 'User 1' },
        splitAmong: []
      });

      // Zero amounts should be rejected for expense tracking
      await expect(expense.save()).rejects.toThrow();
    });

    test('should handle very large amounts', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Expensive',
        amount: 999999.99,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      const saved = await expense.save();
      expect(saved.amount).toBe(999999.99);
    });

    test('should update timestamps on save', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      const saved = await expense.save();
      const originalUpdated = saved.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 100));

      saved.description = 'Updated';
      await saved.save();

      expect(saved.updatedAt.getTime()).toBeGreaterThan(originalUpdated.getTime());
    });

    test('should handle empty splitAmong array', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' },
        splitAmong: []
      });

      const saved = await expense.save();
      expect(saved.splitAmong).toHaveLength(0);
    });

    test('should handle partial settlement', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' },
        splitAmong: [
          { userId: 'user2', userName: 'User 2', amount: 50, settled: false },
          { userId: 'user3', userName: 'User 3', amount: 50, settled: false }
        ],
        totalSettled: 25
      });

      expect(expense.checkIfSettled()).toBe(false);
      expect(expense.totalSettled).toBe(25);
    });
  });

  describe('Alternate Cases', () => {
    test('should default currency to USD', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      const saved = await expense.save();
      expect(saved.currency).toBe('USD');
    });

    test('should uppercase custom currency', async () => {
      const expense = new Expense({
        groupId: 'test-group@g.us',
        description: 'Test',
        amount: 100,
        currency: 'eur',
        paidBy: { userId: 'user1', userName: 'User 1' }
      });

      const saved = await expense.save();
      expect(saved.currency).toBe('EUR');
    });

    test('should query by groupId and settlement status', async () => {
      await Expense.create([
        {
          groupId: 'group1@g.us',
          description: 'Settled',
          amount: 100,
          paidBy: { userId: 'user1', userName: 'User 1' },
          fullySettled: true
        },
        {
          groupId: 'group1@g.us',
          description: 'Unsettled',
          amount: 50,
          paidBy: { userId: 'user1', userName: 'User 1' },
          fullySettled: false
        },
        {
          groupId: 'group2@g.us',
          description: 'Other group',
          amount: 75,
          paidBy: { userId: 'user1', userName: 'User 1' },
          fullySettled: false
        }
      ]);

      const unsettled = await Expense.find({
        groupId: 'group1@g.us',
        fullySettled: false
      });

      expect(unsettled).toHaveLength(1);
      expect(unsettled[0].description).toBe('Unsettled');
    });
  });
});

import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import Expense from '../../src/models/Expense.js';
import Settlement from '../../src/models/Settlement.js';

describe('End-to-End Flow Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-test-e2e');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Expense.deleteMany({});
    await Settlement.deleteMany({});
  });

  describe('Complete Expense Split Flow', () => {
    test('should create expense, settle, and verify balance - happy path', async () => {
      const groupId = 'test-group@g.us';

      // Step 1: Create expense
      const expense = await Expense.create({
        groupId,
        description: 'Dinner',
        amount: 90,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        splitAmong: [
          { userId: 'alice@s.whatsapp.net', userName: 'Alice', amount: 30, settled: true },
          { userId: 'bob@s.whatsapp.net', userName: 'Bob', amount: 30, settled: false },
          { userId: 'charlie@s.whatsapp.net', userName: 'Charlie', amount: 30, settled: false }
        ],
        totalSettled: 30
      });

      expect(expense.fullySettled).toBe(false);

      // Step 2: Bob settles
      const settlement1 = await Settlement.create({
        groupId,
        from: { userId: 'bob@s.whatsapp.net', userName: 'Bob' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 30,
        expenseId: expense._id
      });

      // Update expense
      const bobSplit = expense.splitAmong.find(s => s.userId === 'bob@s.whatsapp.net');
      bobSplit.settled = true;
      expense.totalSettled += 30;
      await expense.save();

      expect(expense.fullySettled).toBe(false); // Charlie still owes

      // Step 3: Charlie settles
      const settlement2 = await Settlement.create({
        groupId,
        from: { userId: 'charlie@s.whatsapp.net', userName: 'Charlie' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 30,
        expenseId: expense._id
      });

      const charlieSplit = expense.splitAmong.find(s => s.userId === 'charlie@s.whatsapp.net');
      charlieSplit.settled = true;
      expense.totalSettled += 30;
      expense.checkIfSettled();
      await expense.save();

      // Step 4: Verify fully settled
      const finalExpense = await Expense.findById(expense._id);
      expect(finalExpense.fullySettled).toBe(true);
      expect(finalExpense.totalSettled).toBe(90);

      // Step 5: Verify settlements
      const settlements = await Settlement.find({ groupId });
      expect(settlements).toHaveLength(2);
    });

    test('should handle unequal splits', async () => {
      const expense = await Expense.create({
        groupId: 'test@g.us',
        description: 'Shared ride',
        amount: 100,
        paidBy: { userId: 'driver@s.whatsapp.net', userName: 'Driver' },
        splitAmong: [
          { userId: 'driver@s.whatsapp.net', userName: 'Driver', amount: 25, settled: true },
          { userId: 'passenger1@s.whatsapp.net', userName: 'P1', amount: 35, settled: false },
          { userId: 'passenger2@s.whatsapp.net', userName: 'P2', amount: 40, settled: false }
        ],
        totalSettled: 25
      });

      const totalSplit = expense.splitAmong.reduce((sum, s) => sum + s.amount, 0);
      expect(totalSplit).toBe(100);
    });

    test('should handle partial settlement scenario', async () => {
      const expense = await Expense.create({
        groupId: 'test@g.us',
        description: 'Large bill',
        amount: 200,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        splitAmong: [
          { userId: 'alice@s.whatsapp.net', userName: 'Alice', amount: 100, settled: true },
          { userId: 'bob@s.whatsapp.net', userName: 'Bob', amount: 100, settled: false }
        ],
        totalSettled: 100
      });

      // Bob pays half
      await Settlement.create({
        groupId: 'test@g.us',
        from: { userId: 'bob@s.whatsapp.net', userName: 'Bob' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 50,
        expenseId: expense._id
      });

      expense.totalSettled += 50;
      await expense.save();

      expect(expense.fullySettled).toBe(false);
      expect(expense.totalSettled).toBe(150);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle settlement without corresponding expense', async () => {
      const settlement = await Settlement.create({
        groupId: 'test@g.us',
        from: { userId: 'bob@s.whatsapp.net', userName: 'Bob' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 50
        // No expenseId
      });

      expect(settlement.expenseId).toBeUndefined();
    });

    test('should handle duplicate expense entries', async () => {
      const data = {
        groupId: 'test@g.us',
        description: 'Duplicate',
        amount: 50,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' }
      };

      const expense1 = await Expense.create(data);
      const expense2 = await Expense.create(data);

      expect(expense1._id).not.toEqual(expense2._id);

      const count = await Expense.countDocuments({ groupId: 'test@g.us' });
      expect(count).toBe(2);
    });

    test('should reject settlement to self', async () => {
      // Settlement to self should be rejected by model validation
      await expect(Settlement.create({
        groupId: 'test@g.us',
        from: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 50
      })).rejects.toThrow('Cannot settle payment to the same user');
    });
  });

  describe('Balance Calculation Scenarios', () => {
    test('should calculate net balances for complex scenario', async () => {
      const groupId = 'test@g.us';

      // Alice paid $90, split 3 ways
      await Expense.create({
        groupId,
        description: 'Dinner',
        amount: 90,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        splitAmong: [
          { userId: 'alice@s.whatsapp.net', userName: 'Alice', amount: 30, settled: true },
          { userId: 'bob@s.whatsapp.net', userName: 'Bob', amount: 30, settled: false },
          { userId: 'charlie@s.whatsapp.net', userName: 'Charlie', amount: 30, settled: false }
        ],
        fullySettled: false
      });

      // Bob paid $60, split 3 ways
      await Expense.create({
        groupId,
        description: 'Drinks',
        amount: 60,
        paidBy: { userId: 'bob@s.whatsapp.net', userName: 'Bob' },
        splitAmong: [
          { userId: 'alice@s.whatsapp.net', userName: 'Alice', amount: 20, settled: false },
          { userId: 'bob@s.whatsapp.net', userName: 'Bob', amount: 20, settled: true },
          { userId: 'charlie@s.whatsapp.net', userName: 'Charlie', amount: 20, settled: false }
        ],
        fullySettled: false
      });

      // Calculate net balances
      const expenses = await Expense.find({ groupId, fullySettled: false });
      const balances = new Map();

      expenses.forEach(expense => {
        const payer = expense.paidBy.userId;
        expense.splitAmong.forEach(split => {
          if (!split.settled && split.userId !== payer) {
            const key = `${split.userId}→${payer}`;
            balances.set(key, (balances.get(key) || 0) + split.amount);
          }
        });
      });

      // Bob owes Alice $30
      expect(balances.get('bob@s.whatsapp.net→alice@s.whatsapp.net')).toBe(30);
      // Charlie owes Alice $30
      expect(balances.get('charlie@s.whatsapp.net→alice@s.whatsapp.net')).toBe(30);
      // Alice owes Bob $20
      expect(balances.get('alice@s.whatsapp.net→bob@s.whatsapp.net')).toBe(20);
      // Charlie owes Bob $20
      expect(balances.get('charlie@s.whatsapp.net→bob@s.whatsapp.net')).toBe(20);
    });

    test('should handle no outstanding balances', async () => {
      const expenses = await Expense.find({
        groupId: 'empty@g.us',
        fullySettled: false
      });

      expect(expenses).toHaveLength(0);
    });
  });

  describe('Data Integrity Tests', () => {
    test('should maintain referential integrity', async () => {
      const expense = await Expense.create({
        groupId: 'test@g.us',
        description: 'Test',
        amount: 100,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' }
      });

      const settlement = await Settlement.create({
        groupId: 'test@g.us',
        from: { userId: 'bob@s.whatsapp.net', userName: 'Bob' },
        to: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        amount: 50,
        expenseId: expense._id
      });

      const foundExpense = await Expense.findById(settlement.expenseId);
      expect(foundExpense).not.toBeNull();
      expect(foundExpense._id.toString()).toBe(expense._id.toString());
    });

    test('should handle concurrent updates', async () => {
      const expense = await Expense.create({
        groupId: 'test@g.us',
        description: 'Concurrent test',
        amount: 100,
        paidBy: { userId: 'alice@s.whatsapp.net', userName: 'Alice' },
        totalSettled: 0
      });

      // Simulate two concurrent settlements
      const update1 = Expense.findByIdAndUpdate(
        expense._id,
        { $inc: { totalSettled: 50 } },
        { new: true }
      );

      const update2 = Expense.findByIdAndUpdate(
        expense._id,
        { $inc: { totalSettled: 30 } },
        { new: true }
      );

      await Promise.all([update1, update2]);

      const final = await Expense.findById(expense._id);
      expect(final.totalSettled).toBe(80);
    });
  });
});

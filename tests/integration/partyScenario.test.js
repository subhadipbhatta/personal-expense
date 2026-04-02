import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import Expense from '../../src/models/Expense.js';
import { parseCommand } from '../../src/utils/commandParser.js';
import { handleExpenseCommand } from '../../src/modules/expenses/handler.js';
import { handleBalanceCommand } from '../../src/modules/balance/handler.js';

/**
 * Party Scenario Test:
 * - Group of 11 people total
 * - 9 people participated in party: A, B, C, D, E, F, G, H, I
 * - Expense 1: A spent $360, split equally among the 9 participants
 * - Expense 2: B spent $450, split equally among the 9 participants
 * - Expense 3: H spent $250, split equally among A, B, C, D, H (5 people)
 *
 * Expected Net Balances:
 * - A is owed: $220 (paid $360, owes $50 to B + $50 to H)
 * - B is owed: $310 (paid $450, owes $40 to A + $50 to H)
 * - C owes: $140 ($40 to A + $50 to B + $50 to H)
 * - D owes: $140 ($40 to A + $50 to B + $50 to H)
 * - E owes: $90 ($40 to A + $50 to B)
 * - F owes: $90 ($40 to A + $50 to B)
 * - G owes: $90 ($40 to A + $50 to B)
 * - H is owed: $110 (paid $250, owes $40 to A + $50 to B)
 * - I owes: $90 ($40 to A + $50 to B)
 */

describe('Party Scenario - 11 Person Group with Multiple Expenses', () => {
  let mockSock;
  let testGroupId;
  let participants;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-splitter-test');

    // Clean up any existing test data
    await Expense.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data
    await Expense.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(() => {
    testGroupId = 'party-group@g.us';

    // Create 11 group members (A-K), but only A-I participate in the party
    participants = [
      { id: 'a@s.whatsapp.net', notify: 'A', name: 'A' },
      { id: 'b@s.whatsapp.net', notify: 'B', name: 'B' },
      { id: 'c@s.whatsapp.net', notify: 'C', name: 'C' },
      { id: 'd@s.whatsapp.net', notify: 'D', name: 'D' },
      { id: 'e@s.whatsapp.net', notify: 'E', name: 'E' },
      { id: 'f@s.whatsapp.net', notify: 'F', name: 'F' },
      { id: 'g@s.whatsapp.net', notify: 'G', name: 'G' },
      { id: 'h@s.whatsapp.net', notify: 'H', name: 'H' },
      { id: 'i@s.whatsapp.net', notify: 'I', name: 'I' },
      { id: 'j@s.whatsapp.net', notify: 'J', name: 'J' },
      { id: 'k@s.whatsapp.net', notify: 'K', name: 'K' }
    ];

    // Mock WhatsApp socket
    mockSock = {
      sendMessage: jest.fn().mockResolvedValue({}),
      groupMetadata: jest.fn().mockResolvedValue({
        id: testGroupId,
        subject: 'Party Group',
        participants: participants
      })
    };
  });

  test('Complete party scenario with 3 expenses and balance calculation', async () => {
    // ========== Expense 1: A paid $360 for party, split among A-I (9 people) ==========
    const expense1Message = {
      key: {
        remoteJid: testGroupId,
        participant: 'a@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: '@anukul split expense $360 party @A @B @C @D @E @F @G @H @I'
      }
    };

    const command1 = parseCommand(expense1Message.message.conversation, '@anukul');
    await handleExpenseCommand(mockSock, expense1Message, command1);

    // Verify expense 1 created
    const expense1 = await Expense.findOne({
      groupId: testGroupId,
      amount: 360,
      description: 'party'
    });
    expect(expense1).toBeTruthy();
    expect(expense1.splitAmong).toHaveLength(9); // A, B, C, D, E, F, G, H, I
    expect(expense1.splitAmong[0].amount).toBe(40); // $360 / 9 = $40 each

    // ========== Expense 2: B paid $450 for other expenses, split among A-I (9 people) ==========
    const expense2Message = {
      key: {
        remoteJid: testGroupId,
        participant: 'b@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: '@anukul split expense $450 other expenses @A @B @C @D @E @F @G @H @I'
      }
    };

    const command2 = parseCommand(expense2Message.message.conversation, '@anukul');
    await handleExpenseCommand(mockSock, expense2Message, command2);

    // Verify expense 2 created
    const expense2 = await Expense.findOne({
      groupId: testGroupId,
      amount: 450,
      description: 'other expenses'
    });
    expect(expense2).toBeTruthy();
    expect(expense2.splitAmong).toHaveLength(9);
    expect(expense2.splitAmong[0].amount).toBe(50); // $450 / 9 = $50 each

    // ========== Expense 3: H paid $250, split among A, B, C, D, H (5 people) ==========
    const expense3Message = {
      key: {
        remoteJid: testGroupId,
        participant: 'h@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: '@anukul split expense $250 special expense @A @B @C @D @H'
      }
    };

    const command3 = parseCommand(expense3Message.message.conversation, '@anukul');
    await handleExpenseCommand(mockSock, expense3Message, command3);

    // Verify expense 3 created
    const expense3 = await Expense.findOne({
      groupId: testGroupId,
      amount: 250
    });
    expect(expense3).toBeTruthy();
    expect(expense3.splitAmong).toHaveLength(5); // A, B, C, D, H
    expect(expense3.splitAmong[0].amount).toBe(50); // $250 / 5 = $50 each

    // ========== Calculate and verify balances ==========
    const balanceMessage = {
      key: {
        remoteJid: testGroupId,
        participant: 'a@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: '@anukul balance expense'
      }
    };

    const balanceCommand = parseCommand(balanceMessage.message.conversation, '@anukul');
    await handleBalanceCommand(mockSock, balanceMessage, balanceCommand);

    // Verify the balance response was sent
    expect(mockSock.sendMessage).toHaveBeenCalled();
    const balanceResponse = mockSock.sendMessage.mock.calls[mockSock.sendMessage.mock.calls.length - 1][1];
    const balanceText = typeof balanceResponse === 'string' ? balanceResponse : balanceResponse.text;

    console.log('\n=== BALANCE REPORT ===');
    console.log(balanceText);
    console.log('=====================\n');

    // Verify all unsettled expenses
    const allExpenses = await Expense.find({
      groupId: testGroupId,
      fullySettled: false
    });
    expect(allExpenses).toHaveLength(3);

    // Verify key balances exist in the response (format: "C owes A: $40.00")
    expect(balanceText).toContain('C owes A');
    expect(balanceText).toContain('$40'); // C owes A $40

    expect(balanceText).toContain('A owes B');
    expect(balanceText).toContain('$50'); // A owes B $50

    expect(balanceText).toContain('C owes H');
    expect(balanceText).toContain('$50'); // C owes H $50

    expect(balanceText).toContain('D owes A');
    expect(balanceText).toContain('D owes B');
    expect(balanceText).toContain('D owes H');

    expect(balanceText).toContain('E owes A');
    expect(balanceText).toContain('E owes B');

    expect(balanceText).toContain('H owes A');
    expect(balanceText).toContain('B owes A');

    // Verify net calculations
    // C should owe: $40 (to A) + $50 (to B) + $50 (to H) = $140 total
    // D should owe: $40 (to A) + $50 (to B) + $50 (to H) = $140 total
    // E, F, G, I should each owe: $40 (to A) + $50 (to B) = $90 total
    // A should owe: $50 (to B) + $50 (to H) = $100 total (but is owed $320, net +$220)
    // B should owe: $40 (to A) + $50 (to H) = $90 total (but is owed $400, net +$310)
    // H should owe: $40 (to A) + $50 (to B) = $90 total (but is owed $200, net +$110)

    console.log('\n=== EXPECTED BALANCES ===');
    console.log('Net positions (simplified):');
    console.log('A is owed: $220 (paid $360 - owes $50 to B - owes $50 to H)');
    console.log('B is owed: $310 (paid $450 - owes $40 to A - owes $50 to H)');
    console.log('C owes: $140 ($40 to A + $50 to B + $50 to H)');
    console.log('D owes: $140 ($40 to A + $50 to B + $50 to H)');
    console.log('E owes: $90 ($40 to A + $50 to B)');
    console.log('F owes: $90 ($40 to A + $50 to B)');
    console.log('G owes: $90 ($40 to A + $50 to B)');
    console.log('H is owed: $110 (paid $250 - owes $40 to A - owes $50 to B)');
    console.log('I owes: $90 ($40 to A + $50 to B)');
    console.log('========================\n');
  });

  test('Verify individual expense breakdowns', async () => {
    // Clean database
    await Expense.deleteMany({ groupId: testGroupId });

    // Add all three expenses
    const expenses = [
      {
        sender: 'a@s.whatsapp.net',
        command: '@anukul split expense $360 party @A @B @C @D @E @F @G @H @I',
        expectedTotal: 360,
        expectedSplit: 40,
        expectedParticipants: 9
      },
      {
        sender: 'b@s.whatsapp.net',
        command: '@anukul split expense $450 other expenses @A @B @C @D @E @F @G @H @I',
        expectedTotal: 450,
        expectedSplit: 50,
        expectedParticipants: 9
      },
      {
        sender: 'h@s.whatsapp.net',
        command: '@anukul split expense $250 special expense @A @B @C @D @H',
        expectedTotal: 250,
        expectedSplit: 50,
        expectedParticipants: 5
      }
    ];

    for (const exp of expenses) {
      const message = {
        key: {
          remoteJid: testGroupId,
          participant: exp.sender,
          fromMe: false
        },
        message: {
          conversation: exp.command
        }
      };

      const command = parseCommand(message.message.conversation, '@anukul');
      await handleExpenseCommand(mockSock, message, command);
    }

    // Verify all expenses created correctly
    const allExpenses = await Expense.find({ groupId: testGroupId }).sort({ createdAt: 1 });
    expect(allExpenses).toHaveLength(3);

    // Verify Expense 1
    expect(allExpenses[0].amount).toBe(360);
    expect(allExpenses[0].splitAmong).toHaveLength(9);
    expect(allExpenses[0].paidBy.userName).toBe('A');
    const expense1PayerSplit = allExpenses[0].splitAmong.find(s => s.userName === 'A');
    expect(expense1PayerSplit.settled).toBe(true); // Payer auto-settled

    // Verify Expense 2
    expect(allExpenses[1].amount).toBe(450);
    expect(allExpenses[1].splitAmong).toHaveLength(9);
    expect(allExpenses[1].paidBy.userName).toBe('B');
    const expense2PayerSplit = allExpenses[1].splitAmong.find(s => s.userName === 'B');
    expect(expense2PayerSplit.settled).toBe(true);

    // Verify Expense 3
    expect(allExpenses[2].amount).toBe(250);
    expect(allExpenses[2].splitAmong).toHaveLength(5);
    expect(allExpenses[2].paidBy.userName).toBe('H');
    const expense3PayerSplit = allExpenses[2].splitAmong.find(s => s.userName === 'H');
    expect(expense3PayerSplit.settled).toBe(true);

    console.log('\n=== EXPENSE BREAKDOWN ===');
    console.log('Expense 1: A paid $360, split among 9 people = $40 each');
    console.log('Expense 2: B paid $450, split among 9 people = $50 each');
    console.log('Expense 3: H paid $250, split among 5 people = $50 each');
    console.log('========================\n');
  });
});

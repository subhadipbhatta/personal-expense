/**
 * Test script for reminder parsing improvements
 * Run with: node test-reminder-parsing.js
 */

import { parseDateTime, getRelativeTime } from './src/utils/dateParser.js';

// Test cases
const testCases = [
  {
    name: 'Relative time - minutes',
    input: 'check expenses in 20 minutes',
    expectedMessage: 'check expenses',
    expectedMinutesFromNow: 20
  },
  {
    name: 'Relative time - hours',
    input: 'call client in 2 hours',
    expectedMessage: 'call client',
    expectedMinutesFromNow: 120
  },
  {
    name: 'Specific time - today',
    input: 'join standup at 3pm',
    expectedMessage: 'join standup',
    expectedHour: 15
  },
  {
    name: 'Tomorrow',
    input: 'review PR tomorrow at 10am',
    expectedMessage: 'review PR',
    expectedHour: 10,
    expectedDayOffset: 1
  },
  {
    name: 'Natural language - half hour',
    input: 'take a break in half an hour',
    expectedMessage: 'take a break',
    expectedMinutesFromNow: 30
  },
  {
    name: 'Very short duration',
    input: 'check slack in 1 minute',
    expectedMessage: 'check slack',
    expectedMinutesFromNow: 1
  },
  {
    name: 'Complex relative',
    input: 'check deployment in 90 minutes',
    expectedMessage: 'check deployment',
    expectedMinutesFromNow: 90
  }
];

console.log('🧪 Testing Reminder Parsing\n');
console.log('Current Time:', new Date().toISOString());
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n📝 Test: ${testCase.name}`);
  console.log(`Input: "${testCase.input}"`);

  try {
    // Parse with dateParser
    const result = parseDateTime(testCase.input);

    if (!result.success) {
      console.log('❌ FAILED: Could not parse');
      failed++;
      continue;
    }

    console.log(`✅ Parsed successfully`);
    console.log(`   Message: "${result.title}"`);
    console.log(`   Scheduled: ${result.startTime.toISOString()}`);
    console.log(`   Relative: ${getRelativeTime(result.startTime)}`);

    // Validate scheduled time is in future
    const now = new Date();
    if (result.startTime <= now) {
      console.log('❌ FAILED: Time is in the past!');
      failed++;
      continue;
    }

    // Validate expected minutes (if specified)
    if (testCase.expectedMinutesFromNow) {
      const diffMinutes = Math.round((result.startTime - now) / (1000 * 60));
      const expectedMin = testCase.expectedMinutesFromNow - 1; // Allow 1 minute variance
      const expectedMax = testCase.expectedMinutesFromNow + 1;

      if (diffMinutes >= expectedMin && diffMinutes <= expectedMax) {
        console.log(`✅ Time offset correct: ${diffMinutes} minutes (expected ~${testCase.expectedMinutesFromNow})`);
      } else {
        console.log(`❌ FAILED: Time offset wrong: ${diffMinutes} minutes (expected ~${testCase.expectedMinutesFromNow})`);
        failed++;
        continue;
      }
    }

    // Validate hour (if specified)
    if (testCase.expectedHour !== undefined) {
      const hour = result.startTime.getHours();
      if (hour === testCase.expectedHour) {
        console.log(`✅ Hour correct: ${hour}`);
      } else {
        console.log(`❌ FAILED: Hour wrong: ${hour} (expected ${testCase.expectedHour})`);
        failed++;
        continue;
      }
    }

    passed++;

  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}

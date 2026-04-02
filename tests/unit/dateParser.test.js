import { describe, test, expect } from '@jest/globals';
import { parseDateTime, formatDuration, getRelativeTime } from '../../src/utils/dateParser.js';

describe('Date Parser - Unit Tests', () => {
  describe('parseDateTime', () => {
    test('should parse tomorrow with time', () => {
      const result = parseDateTime('Team Meeting tomorrow at 3pm');
      expect(result.success).toBe(true);
      expect(result.title).toContain('Team Meeting');
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.startTime.getHours()).toBe(15); // 3pm
    });

    test('should parse specific date', () => {
      const result = parseDateTime('Birthday Party on December 25 at 6pm');
      expect(result.success).toBe(true);
      expect(result.title).toContain('Birthday Party');
      expect(result.startTime.getMonth()).toBe(11); // December (0-indexed)
      expect(result.startTime.getDate()).toBe(25);
      expect(result.startTime.getHours()).toBe(18); // 6pm
    });

    test('should parse Friday at specific time', () => {
      const result = parseDateTime('Lunch on Friday 12pm to 1pm');
      expect(result.success).toBe(true);
      expect(result.title).toContain('Lunch');
      expect(result.startTime.getHours()).toBe(12);
      if (result.endTime) {
        expect(result.endTime.getHours()).toBe(13); // 1pm
      }
    });

    test('should parse "in X hours"', () => {
      const result = parseDateTime('Meeting in 2 hours');
      expect(result.success).toBe(true);
      const expectedTime = new Date();
      expectedTime.setHours(expectedTime.getHours() + 2);
      // Allow 1 minute tolerance
      expect(Math.abs(result.startTime - expectedTime)).toBeLessThan(60000);
    });

    test('should default to 1 hour duration if end time not specified', () => {
      const result = parseDateTime('Quick meeting tomorrow at 10am');
      expect(result.success).toBe(true);
      const duration = result.endTime - result.startTime;
      expect(duration).toBe(60 * 60 * 1000); // 1 hour in ms
    });

    test('should fail gracefully for invalid input', () => {
      const result = parseDateTime('some random text');
      expect(result.success).toBe(false);
    });
  });

  describe('formatDuration', () => {
    test('should format hours correctly', () => {
      const start = new Date('2024-01-01T10:00:00');
      const end = new Date('2024-01-01T12:00:00');
      const result = formatDuration(start, end);
      expect(result).toBe('2 hours');
    });

    test('should format minutes correctly', () => {
      const start = new Date('2024-01-01T10:00:00');
      const end = new Date('2024-01-01T10:30:00');
      const result = formatDuration(start, end);
      expect(result).toBe('30 minutes');
    });

    test('should format hours and minutes', () => {
      const start = new Date('2024-01-01T10:00:00');
      const end = new Date('2024-01-01T12:45:00');
      const result = formatDuration(start, end);
      expect(result).toBe('2 hours 45 minutes');
    });
  });

  describe('getRelativeTime', () => {
    test('should show "in X minutes" for near future', () => {
      const future = new Date();
      future.setMinutes(future.getMinutes() + 30);
      const result = getRelativeTime(future);
      expect(result).toMatch(/in \d+ minutes?/);
    });

    test('should show "tomorrow" for next day', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const result = getRelativeTime(tomorrow);
      expect(result).toBe('tomorrow');
    });

    test('should show "in the past" for past dates', () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      const result = getRelativeTime(past);
      expect(result).toBe('in the past');
    });
  });
});

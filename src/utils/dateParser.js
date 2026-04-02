import * as chrono from 'chrono-node';

/**
 * Parse natural language date/time from text
 *
 * @param {string} text - Text containing date/time information
 * @returns {object} Parsed result with title, startTime, endTime, location
 */
export function parseDateTime(text) {
  try {
    // Use chrono to parse natural language dates
    const results = chrono.parse(text, new Date(), { forwardDate: true });

    if (results.length === 0) {
      return { success: false, error: 'No date/time found in text' };
    }

    // Get the first date range or single date
    const parsed = results[0];
    const startTime = parsed.start.date();

    // Calculate end time (default to 1 hour after start if not specified)
    let endTime;
    if (parsed.end) {
      endTime = parsed.end.date();
    } else {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour
    }

    // Extract title (text before the date mention)
    let title = text.substring(0, parsed.index).trim();

    // Clean up common command words from title
    title = title
      .replace(/^(for|about|regarding|re:)/i, '')
      .trim();

    // Extract location if mentioned (after "at" or "in")
    let location = '';
    const locationMatch = text.match(/(?:at|in)\s+([A-Za-z0-9\s,]+?)(?:\s+on|\s+at|\s+from|$)/i);
    if (locationMatch) {
      location = locationMatch[1].trim();
    }

    // If no title extracted, use default
    if (!title) {
      title = 'Event';
    }

    return {
      success: true,
      title,
      startTime,
      endTime,
      location,
      originalText: text
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(startTime, endTime) {
  const durationMs = endTime - startTime;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}

/**
 * Check if a date is in the past
 */
export function isPast(date) {
  return date < new Date();
}

/**
 * Get relative time string (e.g., "in 2 hours", "tomorrow")
 */
export function getRelativeTime(date) {
  const now = new Date();
  const diffMs = date - now;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 0) {
    return 'in the past';
  } else if (diffMins < 60) {
    return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    // Check if it's tomorrow by comparing dates
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) {
      return 'tomorrow';
    }
    return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  } else {
    // Calculate days difference properly
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTargetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfTargetDay - startOfToday) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'tomorrow';
    } else if (diffDays < 7) {
      return `in ${diffDays} days`;
    } else {
      return `on ${date.toLocaleDateString()}`;
    }
  }
}

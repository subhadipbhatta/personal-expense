import { createEvent } from 'ics';

/**
 * Generate ICS (iCalendar) file content for a calendar event
 *
 * @param {object} eventData - Event data
 * @param {string} eventData.title - Event title
 * @param {string} eventData.description - Event description
 * @param {Date} eventData.startTime - Start time
 * @param {Date} eventData.endTime - End time
 * @param {string} eventData.location - Location
 * @param {string} eventData.organizer - Organizer name/email
 * @returns {Promise<string>} ICS file content
 */
export async function generateICS(eventData) {
  const {
    title,
    description = '',
    startTime,
    endTime,
    location = '',
    organizer = 'Anukul Bot'
  } = eventData;

  // Convert Date objects to ics date array format [year, month, day, hour, minute]
  const start = [
    startTime.getFullYear(),
    startTime.getMonth() + 1, // ics months are 1-indexed
    startTime.getDate(),
    startTime.getHours(),
    startTime.getMinutes()
  ];

  const end = [
    endTime.getFullYear(),
    endTime.getMonth() + 1,
    endTime.getDate(),
    endTime.getHours(),
    endTime.getMinutes()
  ];

  const event = {
    start,
    end,
    title,
    description,
    location,
    organizer: { name: organizer },
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    productId: 'Anukul/WhatsApp Calendar',
    uid: `anukul-${Date.now()}@whatsapp`,
    calName: 'Anukul Events'
  };

  return new Promise((resolve, reject) => {
    createEvent(event, (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

/**
 * Parse ICS content to extract event details
 * (For future use in reading calendar files)
 */
export function parseICS(icsContent) {
  // Basic ICS parser - can be enhanced with a library if needed
  const lines = icsContent.split('\n');
  const event = {};

  for (const line of lines) {
    if (line.startsWith('SUMMARY:')) {
      event.title = line.substring(8).trim();
    } else if (line.startsWith('DESCRIPTION:')) {
      event.description = line.substring(12).trim();
    } else if (line.startsWith('LOCATION:')) {
      event.location = line.substring(9).trim();
    } else if (line.startsWith('DTSTART:')) {
      event.startTime = line.substring(8).trim();
    } else if (line.startsWith('DTEND:')) {
      event.endTime = line.substring(6).trim();
    }
  }

  return event;
}

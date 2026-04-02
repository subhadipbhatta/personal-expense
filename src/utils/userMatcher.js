/**
 * Enhanced user matching for WhatsApp group participants
 * Searches through multiple name fields and supports fuzzy matching
 */

export function findUserByMention(mention, groupMetadata) {
  const normalizedMention = mention.toLowerCase().trim();

  // Return null for empty mention
  if (!normalizedMention) {
    return null;
  }

  // Search through all participants
  for (const participant of groupMetadata.participants) {
    // Get all possible name fields from participant
    const names = [
      participant.notify,           // Contact name
      participant.name,             // WhatsApp profile name
      participant.verifiedName,     // Verified business name
      participant.pushName,         // Push notification name
    ].filter(Boolean); // Remove null/undefined

    // Also extract phone number for matching
    const phoneNumber = participant.id.split('@')[0];

    // Check exact matches (case insensitive)
    for (const name of names) {
      const normalizedName = name.toLowerCase().trim();

      // Exact match
      if (normalizedName === normalizedMention) {
        return participant;
      }

      // Match if mention is contained in name (e.g., "john" matches "John Doe")
      if (normalizedName.includes(normalizedMention)) {
        return participant;
      }

      // Match if name starts with mention
      if (normalizedName.startsWith(normalizedMention)) {
        return participant;
      }

      // Match first name (e.g., "john" matches "John Doe")
      const firstName = normalizedName.split(' ')[0];
      if (firstName === normalizedMention) {
        return participant;
      }
    }

    // Check phone number match (e.g., @1234567890)
    if (phoneNumber.includes(normalizedMention) || normalizedMention.includes(phoneNumber)) {
      return participant;
    }
  }

  return null; // No match found
}

/**
 * Get all possible names for debugging
 */
export function getUserNameOptions(participant) {
  return {
    notify: participant.notify,
    name: participant.name,
    verifiedName: participant.verifiedName,
    pushName: participant.pushName,
    phoneNumber: participant.id.split('@')[0]
  };
}

/**
 * Get list of all participants with their display names
 */
export function getParticipantsList(groupMetadata) {
  return groupMetadata.participants.map(p => {
    const names = [p.notify, p.name, p.verifiedName, p.pushName]
      .filter(Boolean)
      .join(' / ');

    return {
      id: p.id,
      displayName: names || p.id.split('@')[0],
      phoneNumber: p.id.split('@')[0]
    };
  });
}

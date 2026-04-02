import logger from './logger.js';

export async function getUserInfo(sock, groupMetadata, userId) {
  try {
    // Find participant in group metadata
    const participant = groupMetadata.participants.find(p => p.id === userId);

    // Try to get name from various sources (in order of preference)
    const notify = participant?.notify;
    const name = participant?.name;
    const verifiedName = participant?.verifiedName;
    const pushName = participant?.pushName;

    let userName = notify || name || verifiedName || pushName || null;

    // Log what WhatsApp provided
    logger.debug({
      userId,
      notify,
      name,
      verifiedName,
      pushName,
      selectedUserName: userName
    }, 'User info extraction from WhatsApp');

    // If we still don't have a name, format the phone number properly
    if (!userName) {
      const phoneNumber = userId.split('@')[0];

      // Format phone number with country code (e.g., +1234567890)
      if (/^\d+$/.test(phoneNumber)) {
        userName = `+${phoneNumber}`;  // Keep full number with + prefix
        logger.info({
          userId,
          formattedPhone: userName,
          reason: 'No name found in WhatsApp metadata'
        }, 'Using phone number as fallback');
      } else {
        userName = phoneNumber;  // Use as-is if not purely numeric
      }
    }

    return {
      userId,
      userName
    };
  } catch (error) {
    logger.error({ error, userId }, 'Error getting user info');
    // Fallback to phone number with + prefix
    const phoneNumber = userId.split('@')[0];
    return {
      userId,
      userName: /^\d+$/.test(phoneNumber) ? `+${phoneNumber}` : phoneNumber
    };
  }
}

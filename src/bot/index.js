import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import logger from '../utils/logger.js';
import { handleMessage } from './messageHandler.js';
import handleConversationalAI from './conversationalAIHandler.js';
import { isAIEnabled } from '../ai/claudeService.js';
import { initializeReminderScheduler } from '../modules/reminders/scheduler.js';
import { sendWelcomeMessage } from '../modules/conversational/handler.js';
import { getSplitwiseHandler } from '../modules/splitwise/handler.js';

let sock;
let currentQR = null; // Store current QR code for web display
let splitwiseHandler = null;

export async function initializeBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    logger: logger.child({ module: 'baileys' })
  });

  // QR Code handling
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr; // Store for web display
      logger.info('🔗 QR Code available! Visit http://localhost:' + (process.env.PORT || 3002) + '/qr to scan');
      logger.info('Or scan below:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.info('Connection closed, reconnecting:', shouldReconnect);

      // Shutdown Splitwise integration
      if (splitwiseHandler) {
        await splitwiseHandler.shutdown();
        splitwiseHandler = null;
      }

      if (shouldReconnect) {
        await initializeBot();
      }
    } else if (connection === 'open') {
      currentQR = null; // Clear QR code after successful connection
      logger.info('✅ WhatsApp bot connected successfully!');

      // Initialize Splitwise integration
      try {
        splitwiseHandler = getSplitwiseHandler();
        await splitwiseHandler.initialize();
        logger.info('💰 Splitwise integration started');
      } catch (error) {
        logger.error('Failed to start Splitwise integration:', error);
        logger.warn('⚠️  Bot will continue without Splitwise integration');
      }

      // Initialize reminder scheduler
      initializeReminderScheduler(sock);
      logger.info('⏰ Reminder scheduler started');
    }
  });

  // Save credentials when updated
  sock.ev.on('creds.update', saveCreds);

  // Select message handler based on AI availability
  // Conversational AI (full AI): Natural conversations + expense management with Splitwise
  // AI-Enhanced: Natural language expense parsing (legacy)
  // Rule-Based: Command-based only
  const messageHandler = isAIEnabled() ? handleConversationalAI : handleMessage;

  logger.info(`Message handler mode: ${isAIEnabled() ? 'Conversational AI (Splitwise-powered)' : 'Rule-Based'}`);

  // Handle group participation updates (when bot is added to a group)
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id: groupId, participants, action } = update;

      // Check if bot was added to the group
      if (action === 'add') {
        const botNumber = sock.user?.id?.split(':')[0];
        const botWasAdded = participants.some(p => p.split('@')[0] === botNumber);

        if (botWasAdded) {
          logger.info({ groupId }, 'Bot added to new group, sending welcome message');

          // Create Splitwise group mapping
          if (splitwiseHandler) {
            try {
              const groupMetadata = await sock.groupMetadata(groupId);
              await splitwiseHandler.ensureGroupMapping(sock, groupId, groupMetadata);
              logger.info({ groupId }, 'Created Splitwise group mapping');
            } catch (error) {
              logger.error({ error, groupId }, 'Failed to create Splitwise group mapping');
            }
          }

          // Wait a moment before sending welcome message
          setTimeout(() => {
            sendWelcomeMessage(sock, groupId);
          }, 2000);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error handling group participant update');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (message.key.fromMe) continue; // Ignore own messages

      try {
        await messageHandler(sock, message);
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    }
  });

  return sock;
}

export function getSocket() {
  return sock;
}

export function getCurrentQR() {
  return currentQR;
}

import { sendMessage } from '../../bot/messageHandler.js';
import logger from '../../utils/logger.js';

const TRIGGER = process.env.BOT_TRIGGER || '@anukul';
const BOT_NAME = 'Anukul';

/**
 * Send welcome message when bot is added to a group
 */
export async function sendWelcomeMessage(sock, groupId) {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const memberCount = groupMetadata.participants.length;

    const welcomeMessage = `
👋 *Hello ${groupMetadata.subject}!*

I'm *${BOT_NAME}*, your all-in-one WhatsApp assistant! 🤖

I'm here to help your group with:

📊 *Expense Management*
Track and split group expenses easily

📅 *Calendar & Events*
Schedule meetings and share calendar invites

📊 *Polls & Decisions*
Create polls for group decisions

⏰ *Reminders*
Never forget important tasks

💡 *What would you like to do?*

1️⃣ Track an expense → ${TRIGGER} add expense $50 dinner
2️⃣ Schedule a meeting → ${TRIGGER} book calendar Team sync tomorrow 3pm
3️⃣ Create a poll → ${TRIGGER} create poll Lunch spot? Cafe, Restaurant
4️⃣ Set a reminder → ${TRIGGER} remind me to Pay bills Friday
5️⃣ See all commands → ${TRIGGER} help

Just mention ${TRIGGER} followed by what you need, and I'll take care of it! 🎯

Let's get started! 🚀
    `.trim();

    await sendMessage(sock, groupId, welcomeMessage);
    logger.info({ groupId, memberCount }, 'Welcome message sent');

  } catch (error) {
    logger.error({ error, groupId }, 'Error sending welcome message');
  }
}

/**
 * Handle greeting messages
 */
export async function handleGreeting(sock, message, greeting) {
  const groupId = message.key.remoteJid;

  const greetingResponses = {
    morning: [
      `☀️ Good morning! Ready to make today productive?`,
      `🌅 Good morning! How can I help you today?`,
      `☕ Good morning! What's on the agenda today?`
    ],
    afternoon: [
      `👋 Good afternoon! What can I help with?`,
      `☀️ Good afternoon! Need any assistance?`,
      `😊 Good afternoon! How's your day going?`
    ],
    evening: [
      `🌙 Good evening! How can I assist you?`,
      `⭐ Good evening! Need help with anything?`,
      `🌆 Good evening! What can I do for you?`
    ],
    general: [
      `👋 Hey there! How can I help you today?`,
      `😊 Hello! What would you like to do?`,
      `🤗 Hi! I'm here to help!`,
      `👋 Hello! Need assistance with expenses, events, polls, or reminders?`
    ]
  };

  // Determine time of day
  let responseType = 'general';
  const hour = new Date().getHours();
  if (greeting.includes('morning') || (hour >= 5 && hour < 12)) {
    responseType = 'morning';
  } else if (greeting.includes('afternoon') || (hour >= 12 && hour < 17)) {
    responseType = 'afternoon';
  } else if (greeting.includes('evening') || greeting.includes('night') || hour >= 17) {
    responseType = 'evening';
  }

  const responses = greetingResponses[responseType];
  const response = responses[Math.floor(Math.random() * responses.length)];

  const fullMessage = `
${response}

💡 *Quick Actions:*
• 💰 ${TRIGGER} balance expense - Check balances
• 📅 ${TRIGGER} list events - Upcoming events
• ⏰ ${TRIGGER} list reminders - Pending reminders
• ❓ ${TRIGGER} help - See all commands

What would you like to do?
  `.trim();

  await sendMessage(sock, groupId, fullMessage);
}

/**
 * Handle thank you messages
 */
export async function handleThankYou(sock, message) {
  const groupId = message.key.remoteJid;

  const thankYouResponses = [
    `😊 You're welcome! Happy to help!`,
    `🎯 Anytime! That's what I'm here for!`,
    `✨ My pleasure! Let me know if you need anything else!`,
    `🤗 Glad I could help! Feel free to ask anytime!`,
    `💫 You're welcome! I'm always here when you need me!`,
    `👍 No problem! Happy to assist!`
  ];

  const response = thankYouResponses[Math.floor(Math.random() * thankYouResponses.length)];

  await sendMessage(sock, groupId, response);
}

/**
 * Handle "how are you" type questions
 */
export async function handleWellbeingCheck(sock, message) {
  const groupId = message.key.remoteJid;

  const responses = [
    `🤖 I'm doing great, thanks for asking! Ready to help the group! How can I assist you?`,
    `😊 I'm wonderful! All systems running smoothly. What can I do for you today?`,
    `⚡ Running perfectly! Ready to help with expenses, events, polls, or reminders!`,
    `🎯 I'm excellent, thank you! What would you like to accomplish today?`
  ];

  const response = responses[Math.floor(Math.random() * responses.length)];

  await sendMessage(sock, groupId, response);
}

/**
 * Provide contextual suggestions
 */
export async function provideSuggestions(sock, message, context = 'general') {
  const groupId = message.key.remoteJid;

  const suggestions = {
    general: `
💡 *Here's what I can help with:*

1️⃣ *Expenses* 💰
   ${TRIGGER} add expense $50 dinner
   ${TRIGGER} balance expense

2️⃣ *Events* 📅
   ${TRIGGER} book calendar Meeting tomorrow 3pm
   ${TRIGGER} list events

3️⃣ *Polls* 📊
   ${TRIGGER} create poll Lunch? Pizza, Burgers, Sushi

4️⃣ *Reminders* ⏰
   ${TRIGGER} remind me to Check report Friday 5pm
   ${TRIGGER} list reminders

Need more details? Try ${TRIGGER} help
    `.trim(),

    expense: `
💰 *Expense Management Options:*

📝 *Add Expense:*
${TRIGGER} add expense $50 lunch
${TRIGGER} split expense $100 groceries @john @jane

💵 *Settle Payment:*
${TRIGGER} settle expense @john $25

📊 *Check Balances:*
${TRIGGER} balance expense
${TRIGGER} summary expense

Which would you like to do?
    `.trim(),

    calendar: `
📅 *Calendar & Event Options:*

➕ *Create Event:*
${TRIGGER} book calendar Team Meeting tomorrow 3pm
${TRIGGER} schedule event Lunch Friday 12pm

📋 *View Events:*
${TRIGGER} list events

💡 *Tip:* I can understand natural dates like "tomorrow", "next Monday", "Dec 25"!

Ready to schedule something?
    `.trim(),

    poll: `
📊 *Poll Creation Options:*

🗳️ *Single Choice Poll:*
${TRIGGER} create poll Where to eat? Cafe, Restaurant, Food Court

📝 *Multiple Choice Poll:*
${TRIGGER} poll Which features? Calendar, Polls, Reminders

💡 *Tip:* Separate options with commas or pipes (|)!

What would you like to ask the group?
    `.trim(),

    reminder: `
⏰ *Reminder Options:*

⏱️ *Set Reminder:*
${TRIGGER} remind me to Pay bills Friday 5pm
${TRIGGER} set reminder Check expenses tomorrow 9am

📋 *Manage Reminders:*
${TRIGGER} list reminders
${TRIGGER} cancel reminder

💡 *Tip:* I can understand times like "in 2 hours", "tomorrow morning", "next week"!

What should I remind you about?
    `.trim()
  };

  const message_text = suggestions[context] || suggestions.general;
  await sendMessage(sock, groupId, message_text);
}

/**
 * Detect conversational intent from message
 */
export function detectConversationalIntent(messageText) {
  const text = messageText.toLowerCase();

  // Greetings
  const greetingPatterns = [
    /\b(hi|hello|hey|hola|good\s+morning|good\s+afternoon|good\s+evening)\b/i
  ];
  for (const pattern of greetingPatterns) {
    if (pattern.test(text)) {
      return { type: 'greeting', match: text.match(pattern)[0] };
    }
  }

  // Thank you
  const thankYouPatterns = [
    /\b(thanks|thank\s+you|thx|ty|appreciate|grateful)\b/i
  ];
  for (const pattern of thankYouPatterns) {
    if (pattern.test(text)) {
      return { type: 'thankYou' };
    }
  }

  // How are you
  const wellbeingPatterns = [
    /\bhow\s+(are\s+you|r\s+u)\b/i,
    /\bwhat'?s\s+up\b/i,
    /\bhow'?s\s+it\s+going\b/i
  ];
  for (const pattern of wellbeingPatterns) {
    if (pattern.test(text)) {
      return { type: 'wellbeing' };
    }
  }

  // Help requests (only match generic help, not "help me with X")
  const helpPatterns = [
    /\bwhat\s+can\s+you\s+do\s*\??$/i,  // "what can you do?" at end
    /^help\s*\??$/i,                      // Just "help" or "help?"
    /^help\s+me\s*\??$/i,                 // Just "help me" or "help me?" (not "help me with...")
    /\bwhat\s+are\s+your\s+features\b/i,
    /\bshow\s+me\s+options\b/i,
    /\bshow\s+commands\b/i
  ];
  for (const pattern of helpPatterns) {
    if (pattern.test(text)) {
      return { type: 'help' };
    }
  }

  // Suggestions requests
  const suggestionPatterns = [
    /\bsuggest\b/i,
    /\brecommend\b/i,
    /\bwhat\s+should\s+i\s+do\b/i,
    /\bshow\s+me\s+what\b/i
  ];
  for (const pattern of suggestionPatterns) {
    if (pattern.test(text)) {
      // Try to detect context
      if (text.includes('expense') || text.includes('money') || text.includes('pay')) {
        return { type: 'suggestions', context: 'expense' };
      } else if (text.includes('event') || text.includes('meeting') || text.includes('calendar')) {
        return { type: 'suggestions', context: 'calendar' };
      } else if (text.includes('poll') || text.includes('vote')) {
        return { type: 'suggestions', context: 'poll' };
      } else if (text.includes('remind') || text.includes('reminder')) {
        return { type: 'suggestions', context: 'reminder' };
      }
      return { type: 'suggestions', context: 'general' };
    }
  }

  return null;
}

/**
 * Send a random tip
 */
export async function sendRandomTip(sock, groupId) {
  const tips = [
    `💡 *Tip:* You can use natural language! Try "${TRIGGER} I paid 50 for lunch with john"`,
    `💡 *Tip:* Create polls quickly with "${TRIGGER} poll Where to eat? Cafe, Restaurant"`,
    `💡 *Tip:* Schedule events easily: "${TRIGGER} book calendar Meeting tomorrow 3pm"`,
    `💡 *Tip:* Set reminders in plain English: "${TRIGGER} remind me to check expenses tomorrow"`,
    `💡 *Tip:* Check your balance anytime with "${TRIGGER} balance expense"`,
    `💡 *Tip:* I understand dates like "tomorrow", "next Friday", "in 2 hours"!`,
    `💡 *Tip:* You can split expenses among specific people: "${TRIGGER} split expense $100 @john @jane"`
  ];

  const tip = tips[Math.floor(Math.random() * tips.length)];
  await sendMessage(sock, groupId, tip);
}

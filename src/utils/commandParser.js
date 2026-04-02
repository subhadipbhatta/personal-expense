export function parseCommand(messageText, trigger) {
  // Remove trigger and normalize
  const text = messageText
    .toLowerCase()
    .replace(new RegExp(trigger.toLowerCase(), 'gi'), '')
    .trim();

  // Extract action (first word or first two words for compound actions)
  const words = text.split(/\s+/);
  let action = words[0] || 'help';

  // Check for compound actions (e.g., "create poll", "book calendar", "set reminder")
  // Order matters: longer phrases first to avoid partial matches
  const compoundActions = {
    'remind me to': 'reminder',  // Most specific first
    'remind me': 'reminder',
    'set reminder': 'reminder',
    'create poll': 'poll',
    'make poll': 'poll',
    'book calendar': 'calendar',
    'schedule event': 'calendar',
    'add event': 'calendar',
    'list events': 'list-events',
    'show events': 'list-events',
    'list reminders': 'list-reminders',
    'show reminders': 'list-reminders',
    'cancel reminder': 'cancel-reminder',
    'balance expense': 'balance',
    'add expense': 'add',
    'split expense': 'split',
    'settle expense': 'settle',
    'remind': 'reminder'  // Catch-all for "remind" at the end
  };

  // Try matching compound actions
  for (const [compound, normalizedAction] of Object.entries(compoundActions)) {
    if (text.startsWith(compound)) {
      action = normalizedAction;
      break;
    }
  }

  // Get text after action
  let textWithoutAction = text;
  for (const compound of Object.keys(compoundActions)) {
    if (text.startsWith(compound)) {
      textWithoutAction = text.substring(compound.length).trim();
      break;
    }
  }
  if (textWithoutAction === text) {
    textWithoutAction = text.replace(action, '').trim();
  }

  // Remove "expense" keyword after action (e.g., "add expense" -> "add")
  if (textWithoutAction.startsWith('expense')) {
    textWithoutAction = textWithoutAction.replace(/^expense\s*/, '').trim();
  }

  // Extract amount (looks for $XX or XX) - supports any number of decimals
  const amountMatch = textWithoutAction.match(/\$?(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // Extract description (text between amount and @mentions)
  let description = textWithoutAction
    .replace(/\$?\d+(?:\.\d+)?/, '')
    .trim();

  // Extract mentioned users (@john, @jane) - but exclude the trigger
  const mentions = [];
  const mentionMatches = messageText.matchAll(/@(\w+)/g);
  const triggerWord = trigger.toLowerCase().replace('@', '');

  for (const match of mentionMatches) {
    // Don't include the trigger word as a mention
    if (match[1].toLowerCase() !== triggerWord) {
      mentions.push(match[1]);
    }
  }

  // Remove @mentions from description
  description = description.replace(/@\w+/g, '').trim();

  return {
    action,
    amount,
    description: description || textWithoutAction || 'Expense',
    mentions,
    rawText: textWithoutAction || text
  };
}

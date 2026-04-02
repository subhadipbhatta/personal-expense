# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anukul is an all-in-one WhatsApp assistant for group management, built with Baileys (WhatsApp Web API) and MongoDB. The bot provides:
- **Expense Management**: Track expenses, split bills, record settlements, view balances
- **Calendar Events**: Schedule events with natural language, generate .ics files
- **Polls**: Create WhatsApp native polls for group decisions
- **Reminders**: Set scheduled reminders with cron-based delivery
- **Conversational UI**: Welcome messages, greetings, suggestions, context-aware help
- **AI-Powered** (optional): Natural language understanding via Claude API

## Development Commands

```bash
# Start the bot (requires MongoDB running)
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test
npm run test:watch

# Linting
npm run lint
npm run lint:fix
```

### Prerequisites Before Running
1. MongoDB must be running locally (`brew services start mongodb-community`) or configured in `.env`
2. First run requires WhatsApp QR code scan for authentication
3. Session persists in `auth_info_baileys/` directory

## Architecture

### Message Flow (AI-Enhanced Mode)
1. **Baileys** (`src/bot/index.js`) receives WhatsApp messages
2. **AI Message Handler** (`src/bot/aiMessageHandler.js`) checks for `@anukul` trigger
3. **Conversational Intent Detection** (`src/modules/conversational/handler.js`): Check for greetings, thank you, suggestions
   - If conversational: Handle immediately and return (greeting response, suggestions, etc.)
   - If not conversational: Continue to command processing
4. **AI Processing** (`src/ai/claudeService.js`): Attempts natural language parsing with Claude API
   - If confidence > 0.6: Use AI-extracted data
   - If confidence < 0.6 or API fails: Fall back to rule-based parsing
5. **Rule-Based Parser** (`src/utils/commandParser.js`): Extracts action, amount, mentions
6. **Module Handlers** (`src/modules/*/handler.js`) process business logic
7. **MongoDB Models** persist data
8. **Response** sent back to group

### Message Flow (Rule-Based Mode)
Same as AI mode, but skips step 4 (AI Processing) when `ANTHROPIC_API_KEY` not set.

**Important**: Conversational intent is detected BEFORE command parsing. This allows the bot to respond to "hi", "thank you", "suggest something" without treating them as commands.

### Key Components

**Bot Layer** (`src/bot/`)
- `index.js`: Baileys socket initialization, QR auth, reconnection logic, selects AI vs rule-based handler
- `aiMessageHandler.js`: AI-enhanced message handler with fallback to rule-based parsing
- `messageHandler.js`: Pure rule-based message handler (used when AI disabled)

**AI Layer** (`src/ai/`) - Optional, requires Claude API key
- `claudeService.js`: Claude API integration, intent parsing, name matching
- `prompts.js`: System prompts, few-shot examples, context building
- `contextBuilder.js`: Builds group context (members, expenses, balances) for AI

**Modules** (`src/modules/`)
- Each module has `handler.js` for business logic
- `expenses/`: Add/split expenses
- `settlements/`: Record payments between users
- `balance/`: Calculate and display net balances
- `calendar/`: Create calendar events, generate .ics files, list events
- `polls/`: Create WhatsApp native polls with 2-12 options
- `reminders/`: Set/list/cancel reminders; includes `scheduler.js` for cron-based delivery
- `conversational/`: Handle greetings, thank you, suggestions, welcome messages

**Models** (`src/models/`)
- `Expense.js`: Stores expense with `splitAmong` array tracking individual amounts
- `Settlement.js`: Records payments between users
- `CalendarEvent.js`: Stores calendar events with title, time, location, attendees, .ics content
- `Reminder.js`: Stores scheduled reminders with message, scheduledFor, targetUsers, sent flag

**Utilities** (`src/utils/`)
- `commandParser.js`: Extracts structured data from commands
  - Example: `@anukul split expense $100 dinner @john @jane`
    - action: "split", amount: 100, description: "dinner", mentions: ["john", "jane"]
  - Supports compound actions: "create poll", "book calendar", "remind me", "list events"
  - Supports optional "expense" keyword after action for clarity
  - Backward compatible: works with or without "expense" keyword
- `userMatcher.js`: Fuzzy user name matching across multiple WhatsApp name fields
  - Checks: notify, name, verifiedName, pushName, phone number
  - Handles nicknames, partial names, case-insensitive matching
- `dateParser.js`: Natural language date parsing using chrono-node
  - Parses: "tomorrow at 3pm", "Friday 12pm", "in 2 hours", "Dec 25 6pm"
  - Returns structured datetime objects with title, start/end times
  - `getRelativeTime()`: Formats dates as "tomorrow", "in 3 hours", etc.
- `icsGenerator.js`: Generates RFC-compliant .ics calendar files
  - Uses 'ics' library for iCalendar format
  - Includes title, start/end times, location, description

### Data Flow Patterns

**Adding Expense:**
1. Parse command for amount, description, mentions
2. Fetch group metadata to get participant info
3. Calculate split amount (total ÷ participants)
4. Create `Expense` with `splitAmong` array
5. Auto-mark payer's split as settled

**Settling Payment:**
1. Parse amount and recipient from command
2. Create `Settlement` record
3. Find related unsettled `Expense` records
4. Update `splitAmong.settled` flags and `totalSettled` amounts
5. Mark expense as `fullySettled` when all splits paid

**Balance Calculation:**
1. Query unsettled expenses
2. Build net balance map: `userId→payerUserId: amount`
3. Format as "X owes Y: $Z"

**AI Intent Parsing** (when enabled):
1. Build context: Recent expenses, group members, current balances
2. Send to Claude API with system prompt + few-shot examples + user input
3. Parse JSON response with extracted data and confidence score
4. If confidence > 0.6: Use AI-extracted data (action, amount, participants, payer)
5. If confidence < 0.6 or error: Fall back to rule-based parsing
6. Handle clarification requests from AI when data incomplete

**Calendar Event Creation:**
1. Parse command with `dateParser.parseDateTime()` (uses chrono-node)
2. Extract: title, startTime, endTime, location from natural language
3. Generate .ics file with `icsGenerator.generateICS()`
4. Create `CalendarEvent` record in MongoDB
5. Send .ics file as WhatsApp document attachment
6. Send confirmation message with event details

**Poll Creation:**
1. Parse question and options (comma or pipe separated)
2. Validate: 2-12 options required
3. Send WhatsApp native poll via Baileys `sock.sendMessage()` with poll object
4. Poll appears natively in WhatsApp chat with tap-to-vote UI

**Reminder Creation:**
1. Parse message and time with `dateParser.parseDateTime()`
2. Extract target users from @mentions or default to sender
3. Create `Reminder` record with scheduledFor timestamp
4. Cron scheduler (`src/modules/reminders/scheduler.js`) runs every minute
5. Check for due reminders, send messages, mark as sent

**Conversational Intent Detection:**
1. Before command parsing, check message text against regex patterns
2. Patterns: greetings (hi, hello), thank you, wellbeing (how are you), suggestions
3. If matched: Handle immediately (send response) and return early
4. If not matched: Continue to command parsing
5. Context detection for suggestions: Check for keywords (expense, calendar, poll, reminder)
6. Time-aware greetings: Detect time of day for morning/afternoon/evening responses

**Welcome Message (Group Join Event):**
1. Baileys emits `group-participants.update` event when bot added to group
2. Detect bot's own number in added participants
3. Wait 2 seconds (avoid race conditions)
4. Send welcome message with numbered quick actions for all features
5. Includes feature list and example commands

## Important Implementation Details

### User Identification
- WhatsApp users identified by `userId` (phone@s.whatsapp.net)
- Display name priority: notify > name > verifiedName > pushName > phone number
- Use `getUserInfo()` for user data, `findUserByMention()` for fuzzy name matching
- User matcher checks all name fields and handles partial matches, nicknames

### Group-Only Operation
- Bot only responds in groups (`groupId.endsWith('@g.us')`)
- Rejects DMs with error message

### Currency
- Hardcoded to USD for USA groups
- All amounts stored as floats with full decimal precision
- Display formatted to 2 decimals

### Split Command Behavior
- When using `split`, **payer must be included in mentions**
- Example: If A pays and wants to split among A, B, C:
  - Correct: `@anukul split expense $90 pizza @A @B @C`
  - Incorrect: `@anukul split expense $90 pizza @B @C` (only splits among 2 people)
- Payer's split automatically marked as settled

### Command Format & Compound Actions
- **Expense commands** (recommended): `@anukul <action> expense <params>`
  - Examples: `@anukul add expense $50 dinner`, `@anukul balance expense`
- **Legacy format** (still supported): `@anukul <action> <params>`
  - Examples: `@anukul add $50 dinner`, `@anukul balance`
- The "expense" keyword is optional but recommended for clarity

**Compound Actions** (multi-word commands mapped in `commandParser.js`):
- `create poll` → action: "poll"
- `book calendar` → action: "calendar"
- `schedule event` → action: "calendar"
- `add event` → action: "calendar"
- `remind me` → action: "reminder"
- `set reminder` → action: "reminder"
- `list events` → action: "list-events"
- `list reminders` → action: "list-reminders"
- `cancel reminder` → action: "cancel-reminder"

This allows natural multi-word commands while keeping action routing simple.

### Authentication Session
- Baileys stores session in `auth_info_baileys/` (git-ignored)
- QR code regenerates if session deleted
- Auto-reconnect on disconnect (unless logged out)

### Natural Language Date Parsing
- Uses chrono-node for parsing dates/times from natural language
- Supports: "tomorrow", "Friday 3pm", "in 2 hours", "next Monday", "Dec 25 6pm"
- Handles relative times and absolute dates
- `forwardDate: true` ensures past times default to future (e.g., "3pm" means today 3pm if before, tomorrow if after)

### Reminder Scheduling
- Cron job runs every minute: `*/1 * * * *`
- Checks for reminders where `scheduledFor <= now` and `sent: false`
- Sends reminder message to group or target users
- Marks reminder as `sent: true` after delivery
- Cleanup job runs daily at midnight to remove old sent reminders (>30 days)
- Initialized on bot connection in `src/bot/index.js`

### Calendar .ics Files
- Generated using 'ics' library with RFC-compliant format
- Sent as WhatsApp document (`.ics` file attachment)
- Users can tap to add to their device calendar
- Includes: title, start/end times, location, description, timezone (UTC)

### WhatsApp Polls
- Uses Baileys native poll API: `sock.sendMessage(groupId, { poll: { name, values, selectableCount } })`
- Single choice: `selectableCount: 1`
- Multi-choice: `selectableCount: 0` (allows any number)
- Options: 2-12 options supported by WhatsApp
- Appears natively in chat with tap-to-vote interface

### Conversational Features
- **Pattern-based detection**: Regex patterns detect greetings, thank you, suggestions, help
- **Early return**: Conversational messages handled BEFORE command parsing
- **Response variation**: Random selection from 3-6 response templates for natural feel
- **Context-aware suggestions**: Detects keywords (expense, calendar, poll, reminder) to provide relevant help
- **Time-aware greetings**: Morning/afternoon/evening detection based on hour of day
- **Welcome on group join**: Listens for `group-participants.update` event, sends welcome after 2s delay

### AI System Design Principles
- **Hybrid approach**: AI augments rule-based, never replaces it
- **Graceful degradation**: API failures don't break bot functionality
- **Financial accuracy**: AI must extract exact amounts, no hallucination tolerance
- **Confidence threshold**: Requires 60% confidence to trust AI parsing
- **Context-aware**: AI receives group history to make better decisions
- **Clarification over guessing**: AI asks questions rather than making assumptions

## Common Development Tasks

### Adding a New Command
1. Add compound action mapping in `src/utils/commandParser.js` if multi-word (e.g., "create poll" → "poll")
2. Add case in both `aiMessageHandler.js` and `messageHandler.js` switch statements
3. Create handler in `src/modules/<feature>/handler.js`
4. If AI-enhanced: Add intent handling in `src/ai/prompts.js` system prompt
5. Update help message in both message handlers' `sendHelpMessage()` functions
6. If needs scheduling: Add cron job in `src/modules/<feature>/scheduler.js`

### Adding a New Conversational Pattern
1. Add regex pattern to `detectConversationalIntent()` in `src/modules/conversational/handler.js`
2. Create handler function (e.g., `handleNewIntent()`)
3. Add case in switch statement in both message handlers
4. Test with various phrasings to ensure pattern matches correctly

### Modifying Balance Logic
- Core logic in `src/modules/balance/handler.js`
- Uses Map to aggregate net balances from unsettled expenses
- Change aggregation to modify how balances are calculated

### Modifying Date Parsing
- Core logic in `src/utils/dateParser.js`
- Uses chrono-node's `chrono.parse()` with `forwardDate: true`
- `getRelativeTime()` formats dates as "tomorrow", "in X hours", etc.
- Test thoroughly with edge cases (midnight, timezone boundaries)

### Testing Locally
1. Start MongoDB: `brew services start mongodb-community` or `docker run -d -p 27017:27017 mongo`
2. Set up `.env` (copy from `.env.example`)
3. Optional: Add `ANTHROPIC_API_KEY` to test AI features
4. Run bot: `npm run dev`
5. Scan QR code with test WhatsApp account
6. Create test group and send commands

### Testing AI Features
1. Set `ANTHROPIC_API_KEY` in `.env` with real API key
2. Try natural language: `@anukul I paid 50 for lunch with john`
3. Check logs for "AI enabled - attempting natural language processing"
4. Verify fallback: Invalid input should fall back to rule-based
5. Monitor confidence scores in logs

### Testing Calendar Features
1. Test natural language: `@anukul book calendar Team Meeting tomorrow at 3pm`
2. Verify .ics file is sent as document attachment
3. Test edge cases: `@anukul schedule event Party Friday 6pm to 11pm at John's house`
4. Check MongoDB for `CalendarEvent` records
5. Test listing: `@anukul list events`

### Testing Poll Features
1. Test basic poll: `@anukul create poll Where to eat? Pizza, Burgers, Sushi`
2. Verify native WhatsApp poll appears in chat
3. Test with different separators: commas, pipes
4. Test edge cases: 2 options (minimum), 12 options (maximum)

### Testing Reminder Features
1. Test quick reminder: `@anukul remind me to check expenses in 1 minute`
2. Wait for cron job (runs every minute) and verify reminder is sent
3. Test natural language: `@anukul set reminder Team sync tomorrow 9am`
4. Check logs for "Reminder scheduler started" on bot connection
5. Verify MongoDB `Reminder` records with `sent: true` after delivery
6. Test listing: `@anukul list reminders`

### Testing Conversational Features
1. Test greetings: `@anukul hi`, `@anukul good morning`, `@anukul hello`
2. Verify time-aware responses (morning/afternoon/evening based on time)
3. Test thank you: `@anukul thanks`, `@anukul thank you`
4. Test suggestions: `@anukul suggest something`, `@anukul what can you do with expenses?`
5. Test welcome message: Add bot to a new group and verify welcome is sent
6. Verify conversational messages don't trigger command parsing

### Database Queries
- Expenses frequently queried by `groupId` and `fullySettled: false`
- Indexes on `groupId` for performance
- Use `.sort({ createdAt: -1 })` for recent-first ordering

## Error Handling

- All message handlers wrapped in try-catch
- Errors logged via pino logger
- User-facing error messages sent to group (e.g., "❌ Failed to add expense")
- Logger includes context: `{ expenseId, groupId, senderId }`

## Environment Variables

Required in `.env`:
- `MONGODB_URI`: MongoDB connection string
- `BOT_TRIGGER`: Command trigger (default: "@anukul")
- `BOT_NAME`: Bot display name (default: "Anukul")
- `PORT`: Express server port (default: 3002)

Optional:
- `ANTHROPIC_API_KEY`: Claude API key for AI-enhanced natural language processing
  - Get from: https://console.anthropic.com/settings/keys
  - If not set or set to placeholder: Bot uses rule-based parsing only
  - If set: Bot uses hybrid AI + rule-based with automatic fallback
- `LOG_LEVEL`: Pino log level (default: "info")
- `NODE_ENV`: Environment (development/production/test)

### AI vs Rule-Based Modes

**AI-Enhanced Mode** (when `ANTHROPIC_API_KEY` is set):
- Understands natural language: "@anukul I paid 50 for lunch with john and jane"
- Asks clarification questions when data ambiguous
- Falls back to rule-based if confidence < 60% or API error
- Uses Claude 3.5 Sonnet for intent parsing

**Rule-Based Mode** (default, no API key):
- Requires structured commands: `@anukul split expense $50 lunch @john @jane`
- Faster, no external API calls
- Always works offline

## Key Dependencies

**Core Infrastructure:**
- `@whiskeysockets/baileys` (6.7.0+): WhatsApp Web API - handles all WhatsApp communication
- `mongoose` (8.2.0+): MongoDB ODM - database modeling and queries
- `express` (4.18.3+): Web server - serves QR code page for authentication
- `pino` / `pino-pretty`: Structured logging

**Feature-Specific:**
- `chrono-node` (2.9.0): Natural language date parsing for calendar and reminders
- `ics` (3.11.0): iCalendar file generation for calendar events
- `node-cron` (4.2.1): Cron-based job scheduler for reminder delivery
- `@anthropic-ai/sdk` (0.80.0+): Claude API integration for AI-powered natural language

**Utilities:**
- `qrcode` / `qrcode-terminal`: QR code generation for WhatsApp authentication
- `dotenv` (16.4.5+): Environment variable management
- `axios` (1.6.7+): HTTP client for external API calls

## Bot Initialization Sequence

When the bot starts (`src/bot/index.js`):
1. **Load Baileys Auth State**: Read from `auth_info_baileys/` or create new session
2. **Create WebSocket**: Initialize Baileys socket with auth state
3. **QR Code Generation**: If not authenticated, generate QR for scanning
4. **Connection Open**: When connection established:
   - Initialize reminder scheduler (`initializeReminderScheduler()`)
   - Select message handler (AI vs rule-based based on `ANTHROPIC_API_KEY`)
   - Set up event listeners
5. **Event Listeners**:
   - `messages.upsert`: Handle incoming messages
   - `creds.update`: Save updated credentials
   - `group-participants.update`: Detect when bot added to groups (send welcome)
   - `connection.update`: Handle reconnection, QR updates
6. **Scheduler Start**: Cron job begins checking for due reminders every minute

## Baileys-Specific Notes

- `sock.groupMetadata(groupId)` fetches group participants and metadata
- Messages from bot ignored via `message.key.fromMe` check
- `sendMessage()` wrapper handles errors gracefully
- QR code generation via `qrcode-terminal` for CLI display
- Document messages: `sock.sendMessage(jid, { document: buffer, mimetype, fileName })`
- Poll creation: `sock.sendMessage(jid, { poll: { name, values, selectableCount } })`
- Group events: Listen to `sock.ev.on('group-participants.update')` for join/leave notifications
- Bot user ID: `sock.user?.id?.split(':')[0]` gets phone number
- Event system: Baileys uses event emitter pattern (`sock.ev.on('event-name', handler)`)

## Security Notes

- **Never commit real API keys**: `.env.example` should only contain placeholders
- `.env` is git-ignored and contains real credentials
- If API key exposed: Rotate immediately at https://console.anthropic.com/settings/keys
- `auth_info_baileys/` contains WhatsApp session - keep git-ignored
- Bot only works in groups (not DMs) to prevent unauthorized expense tracking

## Testing

### Test Structure
- `tests/unit/` - Unit tests for individual components
- `tests/integration/` - Integration tests for complete flows
- `tests/setup.js` - Test environment configuration

### Running Tests
```bash
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report
npm run test:watch        # Watch mode for development
npm test -- <file>        # Run specific test file
```

### Test Coverage
- **Command Parser:** 100% - All parsing logic including edge cases
- **Expense Model:** 100% - Database validation and business logic
- **Settlement Model:** 100% - Payment tracking logic
- **Integration Tests:** Complex multi-person scenarios (e.g., 11-person party with 3 expenses)
- **Total:** 80+ tests covering positive, negative, edge, and alternate cases

### Key Test Categories
1. **Negative Tests:** Invalid inputs, missing fields, permission checks
2. **Edge Cases:** Boundary conditions, special characters, concurrency
3. **Alternate Flows:** Various split/settlement scenarios
4. **End-to-End:** Complete user journeys from expense to settlement

### Known Issues Fixed by Tests
- Command parser was including trigger word in mentions (fixed)
- Decimal precision limited to 2 places (fixed to support any precision)

### Test Files
- `commandParser.test.js` - Command parsing including compound actions (22+ tests)
- `expenseModel.test.js` - Model validation with 14 tests
- `messageHandler.test.js` - Message handling with 24 tests
- `endToEnd.test.js` - Complete flows with 18 tests
- `partyScenario.test.js` - Complex 11-person party scenario with multiple expenses
- `dateParser.test.js` - Natural language date parsing with 12 tests (tomorrow, relative times, durations)

See `TEST_REPORT.md` for detailed test results, `PARTY_SCENARIO_REPORT.md` for complex scenario example, and `CONVERSATIONAL_FEATURES.md` for conversational features documentation.

**Total Test Count**: 118+ tests passing across all modules

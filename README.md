# Anukul - Your Conversational WhatsApp Assistant 🤖💰

> **A friendly AI assistant you can actually talk to!** Anukul combines natural conversation with powerful expense management through Splitwise integration.

**Just chat naturally:**
```
You: @anukul hey! I paid $50 for pizza with john and sarah
Anukul: ✅ Got it! Added to Splitwise:
        💵 $50 for pizza, split 3 ways
        💰 Each owes: $16.67
```

No commands to memorize. No rigid syntax. Just conversation.

## ✨ What Makes Anukul Special

### 🤖 Conversational AI
- **Natural Conversations**: Chat like you're talking to a friend
- **Smart Understanding**: Understands context and casual language
- **Helpful Insights**: Answers questions about spending patterns
- **Friendly Personality**: Makes expense tracking actually enjoyable

### 💰 Splitwise-Powered Expense Management
- **Cloud Sync**: All expenses stored in Splitwise (access from web/mobile)
- **Real-time Balances**: Always up-to-date calculations
- **Natural Language**: "I paid 50 for lunch" → Automatically tracked
- **Smart Splitting**: Equal splits or custom amounts
- **Payment Tracking**: Record settlements easily
- **Spending Analysis**: Get insights and recommendations

### 📅 Calendar & Events
- **Book Events**: Create calendar events with natural language
- **Share Invites**: Generate and send .ics calendar files
- **List Events**: View upcoming scheduled events
- **Smart Parsing**: Understands "tomorrow at 3pm", "Friday 12pm", etc.

### 📊 Polls
- **Create Polls**: Make WhatsApp polls directly in groups
- **Multiple Options**: Support for 2-12 poll options
- **Single/Multi Select**: Create single-choice or multi-select polls

### ⏰ Reminders
- **Set Reminders**: Schedule reminder messages
- **Natural Language**: "remind me to check expenses tomorrow 9am"
- **Target Users**: Remind specific people or the whole group
- **List & Cancel**: View pending reminders and cancel them

### 💬 Other Features
- 📅 **Calendar Events** with .ics files
- 📊 **WhatsApp Polls** for group decisions
- ⏰ **Smart Reminders** with natural language
- 🎯 **Help & Suggestions** when you need them

## 🌟 Example Conversations

**Casual Greeting:**
```
You: @anukul hey!
Anukul: Hey there! 👋 How can I help you today?
```

**Natural Expense Tracking:**
```
You: @anukul I covered dinner last night, $80. Split with john, sarah, and mike
Anukul: ✅ Got it! Added to Splitwise:
        💵 $80 for dinner
        👥 Split with: John, Sarah, Mike
        💰 Each owes: $20.00
```

**Smart Questions:**
```
You: @anukul how much have we spent on food?
Anukul: 📊 You've spent $280 on food this month!

        That's 62% of your total expenses.
        💡 Consider meal planning to reduce costs!
```

**Quick Balance Check:**
```
You: @anukul what's the status?
Anukul: *💰 Current Balances*
        💸 Sarah owes $35.00
        💸 Mike owes $25.00
        ✅ Everyone else is settled!
```

**See full documentation:** [CONVERSATIONAL_AI_SPLITWISE.md](./CONVERSATIONAL_AI_SPLITWISE.md)

---

## Prerequisites

- **Node.js** >= 18.0.0
- **MongoDB** (local or remote)
- **WhatsApp account** (for bot authentication)
- **Splitwise account** (free - for expense storage)
- **Claude API key** (optional but highly recommended for conversational AI)

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI
   ```

3. **Start MongoDB**
   ```bash
   # macOS with Homebrew
   brew services start mongodb-community

   # Or use Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

4. **Run the bot**
   ```bash
   npm start
   ```

5. **Scan QR Code**
   - A QR code will appear in your terminal
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices > Link a Device
   - Scan the QR code

6. **Add to Groups**
   - The bot is now connected to your WhatsApp account
   - Add it to any group by inviting your number

## Usage

Once added to a group, use these commands:

### 💰 Expense Management
```
@anukul add expense $50 dinner
@anukul split expense $120 groceries @john @jane
@anukul settle expense @john $25
@anukul balance expense
```

### 📅 Calendar & Events
```
@anukul book calendar Team Meeting tomorrow at 3pm
@anukul schedule event Lunch on Friday 12pm to 1pm
@anukul add event Birthday Party Dec 25 6pm
@anukul list events
```

### 📊 Polls
```
@anukul create poll What should we eat? Pizza, Burgers, Sushi
@anukul poll Best time to meet? 2pm, 3pm, 4pm, 5pm
```

### ⏰ Reminders
```
@anukul remind me to check expenses tomorrow at 9am
@anukul set reminder Pay bills on Friday 5pm
@anukul reminder Meeting prep in 2 hours
@anukul list reminders
@anukul cancel reminder
```

### 🤖 Natural Language (with AI enabled)
```
@anukul I paid 50 for lunch with john and jane
@anukul schedule a meeting tomorrow afternoon
@anukul remind everyone about the party on Saturday
```

### Get Help
```
@anukul help
```

## Commands Reference

### Expenses
| Command | Description | Example |
|---------|-------------|---------|
| `add expense` | Add expense split equally | `@anukul add expense $50 pizza` |
| `split expense` | Split among specific people | `@anukul split expense $100 @john @jane` |
| `settle expense` | Record a payment | `@anukul settle expense @john $25` |
| `balance expense` | Show group balances | `@anukul balance expense` |

### Calendar
| Command | Description | Example |
|---------|-------------|---------|
| `book calendar` | Create calendar event | `@anukul book calendar Meeting tomorrow 3pm` |
| `schedule event` | Alternative calendar command | `@anukul schedule event Lunch Friday 12pm` |
| `list events` | Show upcoming events | `@anukul list events` |

### Polls
| Command | Description | Example |
|---------|-------------|---------|
| `create poll` | Create a poll | `@anukul create poll Where to eat? Pizza, Burgers` |
| `poll` | Shorthand for create poll | `@anukul poll Best time? 2pm, 3pm` |

### Reminders
| Command | Description | Example |
|---------|-------------|---------|
| `remind me` | Set a reminder | `@anukul remind me to Pay bills Friday 5pm` |
| `set reminder` | Alternative reminder command | `@anukul set reminder Check email in 1 hour` |
| `list reminders` | Show pending reminders | `@anukul list reminders` |
| `cancel reminder` | Cancel last reminder | `@anukul cancel reminder` |

### General
| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show help message | `@anukul help` |

**Note**: Most keywords are flexible. For example, `@anukul add $50 pizza` works without "expense".

## Development

### Running in Development Mode
```bash
npm run dev
```

### Running Tests
```bash
npm test
npm run test:watch
```

### Linting
```bash
npm run lint
npm run lint:fix
```

## Architecture

```
src/
├── bot/                    # WhatsApp bot setup
│   ├── index.js           # Baileys initialization
│   └── messageHandler.js  # Message routing
├── config/                # Configuration
│   └── database.js        # MongoDB connection
├── models/                # Database models
│   ├── Expense.js         # Expense schema
│   └── Settlement.js      # Settlement schema
├── modules/               # Feature modules
│   ├── expenses/          # Expense management
│   ├── settlements/       # Payment tracking
│   └── balance/           # Balance calculations
├── utils/                 # Utilities
│   ├── logger.js          # Logging
│   ├── commandParser.js   # Command parsing
│   └── userHelpers.js     # User utilities
└── index.js              # Application entry
```

## Database Schema

### Expense
- `groupId`: WhatsApp group ID
- `description`: What the expense was for
- `amount`: Total amount
- `paidBy`: Who paid
- `splitAmong`: Array of splits with amounts
- `fullySettled`: Whether fully paid

### Settlement
- `groupId`: WhatsApp group ID
- `from`: Who paid
- `to`: Who received payment
- `amount`: Payment amount
- `expenseId`: Related expense (optional)

## Troubleshooting

**QR Code not appearing?**
- Make sure you're not already logged in
- Delete `auth_info_baileys` folder and restart

**Bot not responding in groups?**
- Ensure the message includes `@anukul` trigger
- Check bot has proper group permissions
- Verify `BOT_TRIGGER` in `.env` matches your commands

**Database connection errors?**
- Verify MongoDB is running: `mongosh`
- Check `MONGODB_URI` in `.env`

## License

MIT

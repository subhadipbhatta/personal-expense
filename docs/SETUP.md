# Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start MongoDB

### Option A: macOS with Homebrew
```bash
brew services start mongodb-community
```

### Option B: Docker
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Option C: MongoDB Atlas (Cloud)
1. Create free cluster at https://www.mongodb.com/cloud/atlas
2. Get connection string
3. Update `MONGODB_URI` in `.env`

## Step 3: Configure Environment

Edit `.env` file:
```bash
MONGODB_URI=mongodb://localhost:27017/expense-splitter
BOT_TRIGGER=@expense
PORT=3000
```

## Step 4: Run the Bot

```bash
npm start
```

## Step 5: Authenticate with WhatsApp

1. QR code will appear in terminal
2. Open WhatsApp on your phone
3. Go to: **Settings → Linked Devices → Link a Device**
4. Scan the QR code

## Step 6: Add to Groups

The bot is now linked to your WhatsApp account. Add it to any group!

## Testing the Bot

In any group where the bot is present:

```
@expense help
@expense add $20 lunch
@expense balance
```

## Troubleshooting

**QR Code not showing?**
- Delete `auth_info_baileys/` folder
- Restart: `npm start`

**Connection errors?**
- Check MongoDB is running: `mongosh`
- Verify `.env` settings

**Bot not responding?**
- Make sure message includes `@expense`
- Check logs for errors

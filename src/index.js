import express from 'express';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { connectDB } from './config/database.js';
import { initializeBot, getCurrentQR } from './bot/index.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Root endpoint - Welcome page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Expense Splitter Bot</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #25D366; }
        .status { padding: 10px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>💰 WhatsApp Expense Splitter Bot</h1>
      <div class="status">
        <strong>✅ Server Status:</strong> Running<br>
        <strong>📅 Timestamp:</strong> ${new Date().toISOString()}<br>
        <strong>🔌 Port:</strong> ${PORT}
      </div>
      <h2>📱 How to Use</h2>
      <ol>
        <li><a href="/qr"><strong>Click here to scan QR code</strong></a> with WhatsApp</li>
        <li>Add your WhatsApp number to any group</li>
        <li>Send commands using <code>@expense</code></li>
      </ol>
      <h3>Example Commands:</h3>
      <ul>
        <li><code>@expense help</code> - Show available commands</li>
        <li><code>@expense add $50 dinner</code> - Add an expense</li>
        <li><code>@expense balance</code> - Show group balances</li>
      </ul>
      <p><strong>Health Check:</strong> <a href="/health">/health</a></p>
    </body>
    </html>
  `);
});

// QR Code endpoint - Display QR in browser
app.get('/qr', async (req, res) => {
  const qr = getCurrentQR();

  if (!qr) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <meta http-equiv="refresh" content="3">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .status { color: #25D366; font-size: 24px; margin: 20px; }
        </style>
      </head>
      <body>
        <h1>WhatsApp Expense Bot</h1>
        <div class="status">✅ Already connected to WhatsApp!</div>
        <p>No QR code needed. The bot is ready to use.</p>
        <p><a href="/">Back to Home</a></p>
      </body>
      </html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Scan WhatsApp QR Code</title>
        <meta http-equiv="refresh" content="20">
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
          }
          .container {
            background: white;
            color: #333;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { color: #25D366; margin-bottom: 10px; }
          .qr-container {
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
          }
          img {
            max-width: 100%;
            border: 10px solid white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          .instructions {
            text-align: left;
            margin: 20px 0;
            padding: 20px;
            background: #e8f5e9;
            border-radius: 10px;
            border-left: 4px solid #25D366;
          }
          .instructions li { margin: 10px 0; }
          .auto-refresh {
            color: #666;
            font-size: 14px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📱 WhatsApp Expense Bot</h1>
          <p>Scan this QR code with your WhatsApp to connect the bot</p>

          <div class="qr-container">
            <img src="${qrImage}" alt="WhatsApp QR Code" />
          </div>

          <div class="instructions">
            <strong>📲 How to Scan:</strong>
            <ol>
              <li>Open <strong>WhatsApp</strong> on your phone</li>
              <li>Go to <strong>Settings</strong> (⚙️)</li>
              <li>Tap <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li><strong>Scan this QR code</strong></li>
            </ol>
          </div>

          <div class="auto-refresh">
            🔄 QR code refreshes automatically every 20 seconds
          </div>

          <p style="margin-top: 20px;">
            <a href="/" style="color: #667eea; text-decoration: none;">← Back to Home</a>
          </p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error generating QR code:', error);
    res.status(500).send('Error generating QR code');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('Database connected successfully');

    // Initialize WhatsApp bot
    await initializeBot();
    logger.info('WhatsApp bot initialized successfully');

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

start();

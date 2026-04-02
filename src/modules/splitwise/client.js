import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Splitwise MCP Client
 * Communicates with the Python Splitwise MCP server via stdio
 */
class SplitwiseMCPClient {
  constructor() {
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.isReady = false;
  }

  /**
   * Start the MCP server process
   */
  async start() {
    if (this.process) {
      logger.warn('Splitwise MCP server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      const venvPath = path.join(__dirname, '../../../venv/bin/python3');
      const serverPath = path.join(__dirname, '../../splitwise_mcp_server');

      logger.info('Starting Splitwise MCP server...');

      this.process = spawn(venvPath, ['-m', 'splitwise_mcp_server'], {
        cwd: path.join(__dirname, '../..'),
        env: {
          ...process.env,
          PYTHONPATH: path.join(__dirname, '../..'),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';

      this.process.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        lines.forEach((line) => {
          if (!line.trim()) return;

          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (err) {
            logger.debug('Non-JSON output from MCP server:', line);
          }
        });
      });

      this.process.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          logger.error('MCP server stderr:', msg);
          console.error('MCP SERVER ERROR:', msg);
        }
      });

      // Handle stdin errors to prevent EPIPE crashes
      this.process.stdin.on('error', (err) => {
        logger.warn('MCP server stdin error:', err.message);
      });

      this.process.on('error', (err) => {
        logger.error('MCP server process error:', err);
        reject(err);
      });

      this.process.on('exit', (code) => {
        logger.info(`MCP server exited with code ${code}`);
        this.isReady = false;
        this.process = null;
      });

      // Wait for process to start, then initialize MCP protocol
      setTimeout(async () => {
        try {
          // Send MCP initialize request
          await this.initialize();
          this.isReady = true;
          logger.info('Splitwise MCP server started successfully');
          resolve();
        } catch (err) {
          logger.error('Failed to initialize MCP server:', err);
          reject(err);
        }
      }, 3000); // Give server time to start accepting connections
    });
  }

  /**
   * Initialize MCP protocol handshake
   */
  async initialize() {
    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'splitwise-whatsapp-bot',
          version: '1.0.0'
        }
      }
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Check if process and stdin are available
      if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
        reject(new Error('MCP process stdin not available'));
        return;
      }

      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
        return;
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP initialization timeout'));
        }
      }, 10000);
    }).then((result) => {
      // Send initialized notification
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      // Check if process and stdin are still available before writing
      if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
        try {
          this.process.stdin.write(JSON.stringify(notification) + '\n');
          logger.info('MCP protocol initialized');
        } catch (err) {
          logger.warn('Failed to send initialized notification:', err.message);
        }
      }

      return result;
    });
  }

  /**
   * Stop the MCP server process
   */
  async stop() {
    if (!this.process) return;

    return new Promise((resolve) => {
      this.process.on('exit', () => {
        this.process = null;
        this.isReady = false;
        resolve();
      });

      this.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Handle incoming messages from MCP server
   */
  handleMessage(message) {
    logger.debug('MCP server message received:', JSON.stringify(message, null, 2));

    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        logger.error('MCP server returned error:', JSON.stringify(message.error, null, 2));
        reject(new Error(message.error.message || 'MCP server error'));
      } else {
        resolve(message.result);
      }
    }
  }

  /**
   * Send a tool call request to the MCP server
   */
  async callTool(toolName, params = {}) {
    if (!this.isReady || !this.process) {
      throw new Error('MCP server not ready. Call start() first.');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Check if stdin is writable
      if (!this.process.stdin || this.process.stdin.destroyed) {
        this.pendingRequests.delete(id);
        reject(new Error('MCP process stdin not available'));
        return;
      }

      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
        return;
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    return this.callTool('get_current_user');
  }

  /**
   * Create an expense in Splitwise
   */
  async createExpense({ cost, description, groupId, users, splitEqually = true }) {
    return this.callTool('create_expense', {
      cost: cost.toString(),
      description,
      group_id: groupId,
      users: users.map(u => ({
        user_id: u.userId,
        paid_share: u.paidShare?.toString() || '0',
        owed_share: u.owedShare?.toString() || cost.toString(),
      })),
      split_equally: splitEqually,
    });
  }

  /**
   * Get expenses for a group
   */
  async getExpenses(groupId, limit = 20) {
    return this.callTool('get_expenses', {
      group_id: groupId,
      limit,
    });
  }

  /**
   * Get groups for current user
   */
  async getGroups() {
    return this.callTool('get_groups');
  }

  /**
   * Get specific group by ID
   */
  async getGroup(groupId) {
    return this.callTool('get_group', { group_id: groupId });
  }

  /**
   * Create a new group
   */
  async createGroup(name, users = []) {
    return this.callTool('create_group', {
      name,
      users: users.map(u => ({ email: u.email, first_name: u.firstName, last_name: u.lastName })),
    });
  }

  /**
   * Delete an expense
   */
  async deleteExpense(expenseId) {
    return this.callTool('delete_expense', { expense_id: expenseId });
  }

  /**
   * Add user to group
   */
  async addUserToGroup(groupId, userId, firstName, lastName) {
    return this.callTool('add_user_to_group', {
      group_id: groupId,
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
    });
  }
}

// Singleton instance
let clientInstance = null;

export function getSplitwiseClient() {
  if (!clientInstance) {
    clientInstance = new SplitwiseMCPClient();
  }
  return clientInstance;
}

export default SplitwiseMCPClient;

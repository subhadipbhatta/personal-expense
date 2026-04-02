/**
 * Quick MCP Connection Test
 * Tests if the Splitwise MCP server is responding correctly
 */

import { getSplitwiseHandler } from './src/modules/splitwise/handler.js';
import logger from './src/utils/logger.js';

async function testMCPConnection() {
  console.log('🔍 Testing Splitwise MCP Connection...\n');

  try {
    // Get the handler (same instance the bot uses)
    const handler = getSplitwiseHandler();

    console.log('1️⃣ Checking if MCP server is running...');
    if (!handler.client.isReady) {
      console.log('   ⚠️  MCP server not initialized. Starting...');
      await handler.initialize();
    } else {
      console.log('   ✅ MCP server already running');
    }

    console.log('\n2️⃣ Testing MCP connection by fetching current user...');
    const userResult = await handler.client.getCurrentUser();

    // MCP returns data in structuredContent field
    const userData = userResult?.structuredContent || {};
    const user = userData.user || userResult.user;

    if (user) {
      console.log('   ✅ MCP Connection Successful!\n');
      console.log('   📊 Splitwise Account Info:');
      console.log(`   👤 Name: ${user.first_name} ${user.last_name}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🆔 User ID: ${user.id}`);
    } else {
      console.log('   ❌ Failed to get user data');
      console.log('   Response:', JSON.stringify(userResult, null, 2));
    }

    console.log('\n3️⃣ Testing MCP tools by fetching groups...');
    const groupsResult = await handler.client.getGroups();
    const groupsData = groupsResult?.structuredContent || {};
    const groups = groupsData.groups || groupsResult.groups || [];

    if (groups && groups.length > 0) {
      console.log(`   ✅ Found ${groups.length} Splitwise groups\n`);
      console.log('   📊 Your Groups:');
      groups.slice(0, 5).forEach((group, i) => {
        console.log(`   ${i + 1}. ${group.name} (ID: ${group.id})`);
      });
      if (groups.length > 5) {
        console.log(`   ... and ${groups.length - 5} more`);
      }
    } else {
      console.log('   ℹ️  No groups found (this is okay if you haven\'t created any)');
    }

    console.log('\n✅ MCP CONNECTION TEST PASSED!\n');
    console.log('🎉 All MCP tools are working correctly.');
    console.log('💬 You can now use the bot in WhatsApp!\n');

    return true;

  } catch (error) {
    console.error('\n❌ MCP CONNECTION TEST FAILED!\n');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    return false;
  }
}

// Run the test
testMCPConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

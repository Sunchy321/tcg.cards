/**
 * Test script to verify the Hearthstone search endpoint works correctly
 * This tests the schema validation and data flow
 */

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';

// Import router type
type Router = typeof import('./server/orpc/service').router;

async function testSearchEndpoint() {
  console.log(' Testing Hearthstone Search Endpoint...\n');

  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3002';
  console.log(`📍 Base URL: ${baseUrl}\n`);

  const link = new RPCLink({
    url: `${baseUrl}/rpc`,
  });

  const orpc: RouterClient<Router> = createORPCClient(link);

  // Test 1: Basic search with empty query
  console.log('Test 1: Empty query (should return error or empty result)');
  try {
    const result = await orpc.hearthstone.search.basic({
      q: '',
      lang: 'zhs',
      page: 1,
      pageSize: 10,
    });
    console.log('✅ Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.cause) {
      console.log('   Cause:', JSON.stringify(error.cause, null, 2));
    }
  }
  console.log('');

  // Test 2: Search for a common card
  console.log('Test 2: Search for "fireball" (炎爆术)');
  try {
    const result = await orpc.hearthstone.search.basic({
      q: 'fireball',
      lang: 'en',
      page: 1,
      pageSize: 5,
    });
    console.log('✅ Success!');
    console.log('   Total results:', result.result?.total);
    console.log('   Page:', result.result?.page);
    console.log('   Total pages:', result.result?.totalPage);
    console.log('   Elapsed:', result.result?.elapsed, 'ms');
    console.log('   First card:', result.result?.result?.[0]?.cardId);
    if (result.result?.result?.[0]) {
      const card = result.result.result[0];
      console.log('   Card name:', card.localization?.name);
      console.log('   Card type:', card.type);
      console.log('   Card cost:', card.cost);
    }
    if (result.errors && result.errors.length > 0) {
      console.log('   ️  Warnings:', result.errors);
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.cause) {
      console.log('   Cause:', JSON.stringify(error.cause, null, 2));
    }
    if (error.issues) {
      console.log('   Validation issues:', JSON.stringify(error.issues, null, 2));
    }
  }
  console.log('');

  // Test 3: Search with Chinese
  console.log('Test 3: Search for "炎爆术" (Chinese)');
  try {
    const result = await orpc.hearthstone.search.basic({
      q: '炎爆术',
      lang: 'zhs',
      page: 1,
      pageSize: 5,
    });
    console.log('✅ Success!');
    console.log('   Total results:', result.result?.total);
    console.log('   First card:', result.result?.result?.[0]?.cardId);
    if (result.result?.result?.[0]) {
      const card = result.result.result[0];
      console.log('   Card name:', card.localization?.name);
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.cause) {
      console.log('   Cause:', JSON.stringify(error.cause, null, 2));
    }
    if (error.issues) {
      console.log('   Validation issues:', JSON.stringify(error.issues, null, 2));
    }
  }
  console.log('');

  // Test 4: Search with filter
  console.log('Test 4: Search with filter "cost>=5"');
  try {
    const result = await orpc.hearthstone.search.basic({
      q: 'cost>=5',
      lang: 'en',
      page: 1,
      pageSize: 5,
    });
    console.log('✅ Success!');
    console.log('   Total results:', result.result?.total);
    if (result.result?.result?.[0]) {
      const card = result.result.result[0];
      console.log('   First card cost:', card.cost);
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.cause) {
      console.log('   Cause:', JSON.stringify(error.cause, null, 2));
    }
    if (error.issues) {
      console.log('   Validation issues:', JSON.stringify(error.issues, null, 2));
    }
  }
  console.log('');

  // Test 5: Schema validation - check version field
  console.log('Test 5: Verify version field accepts empty array');
  try {
    const result = await orpc.hearthstone.search.basic({
      q: 'test',
      lang: 'en',
      page: 1,
      pageSize: 1,
    });
    
    // Check if we got any results
    if (result.result?.result && result.result.result.length > 0) {
      const card = result.result.result[0];
      console.log('✅ Got card with version:', card.version);
      console.log('   Version is array:', Array.isArray(card.version));
      console.log('   Version length:', card.version?.length);
    } else {
      console.log('️  No cards returned (database may be empty)');
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.issues) {
      console.log('   Validation issues:', JSON.stringify(error.issues, null, 2));
    }
  }
  console.log('');

  console.log(' All tests completed!');
}

// Run the test
testSearchEndpoint().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

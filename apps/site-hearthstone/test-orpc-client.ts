/**
 * Test using oRPC client directly
 */

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

async function testWithORPCClient() {
  console.log(' Testing with oRPC client...\n');

  const link = new RPCLink({
    url: 'http://localhost:3002/rpc',
  });

  const orpc = createORPCClient(link);

  try {
    const result = await orpc.hearthstone.search.basic({
      q: 'fireball',
      lang: 'en',
      page: 1,
      pageSize: 5,
    });

    console.log('✅ SUCCESS!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.result) {
      console.log('\nTotal results:', result.result.total);
      console.log('First card:', result.result.result?.[0]?.cardId);
      if (result.result.result?.[0]) {
        console.log('Card name:', result.result.result[0].localization?.name);
        console.log('Version field:', result.result.result[0].version);
      }
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
    if (error.cause) {
      console.log('Cause:', JSON.stringify(error.cause, null, 2));
    }
    if (error.issues) {
      console.log('Validation issues:', JSON.stringify(error.issues, null, 2));
    }
  }
}

testWithORPCClient().catch(error => {
  console.error('Fatal error:', error);
});

/**
 * Detailed test to capture full response and validation errors
 */

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

async function testSearchDetailed() {
  console.log(' Testing search with detailed error capture...\n');

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
    console.log('\nFull result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.result) {
      console.log('\n📊 Statistics:');
      console.log('  Total results:', result.result.total);
      console.log('  Page:', result.result.page);
      console.log('  Total pages:', result.result.totalPage);
      console.log('  Elapsed:', result.result.elapsed, 'ms');
      
      if (result.result.result && result.result.result.length > 0) {
        console.log('\n🃏 First card:');
        const card = result.result.result[0];
        console.log('  Card ID:', card.cardId);
        console.log('  Name:', card.localization?.name);
        console.log('  Type:', card.type);
        console.log('  Cost:', card.cost);
        console.log('  Version:', card.version);
      }
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  Warnings/Errors:');
      console.log(JSON.stringify(result.errors, null, 2));
    }
  } catch (error: any) {
    console.log('❌ Error occurred!');
    console.log('\nError message:', error.message);
    console.log('\nError name:', error.name);
    
    if (error.cause) {
      console.log('\nCause:');
      console.log(JSON.stringify(error.cause, null, 2));
    }
    
    if (error.issues) {
      console.log('\n🔍 Validation issues:');
      error.issues.forEach((issue: any, idx: number) => {
        console.log(`\n  Issue ${idx + 1}:`);
        console.log('    Path:', issue.path?.join('.') || 'root');
        console.log('    Message:', issue.message);
        console.log('    Code:', issue.code);
        console.log('    Expected:', issue.expected);
        console.log('    Received:', typeof issue.received, JSON.stringify(issue.received));
      });
    }
    
    // Try to get the raw response if available
    if (error.response) {
      console.log('\n📄 Raw response:');
      console.log(JSON.stringify(error.response, null, 2));
    }
  }
}

testSearchDetailed().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

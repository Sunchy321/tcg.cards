/**
 * Test to see raw API response
 */

async function testRawResponse() {
  console.log(' Fetching raw API response...\n');

  const baseUrl = 'http://localhost:3002';
  
  // Make a direct fetch request to bypass oRPC client validation
  const response = await fetch(`${baseUrl}/rpc/hearthstone/search/basic?q=test&lang=en&page=1&pageSize=1`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  console.log('Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers.entries()));
  
  const text = await response.text();
  console.log('\nRaw response body:');
  console.log(text);
  
  try {
    const json = JSON.parse(text);
    console.log('\nParsed JSON:');
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('\nFailed to parse as JSON');
  }
}

testRawResponse().catch(error => {
  console.error('Error:', error);
});

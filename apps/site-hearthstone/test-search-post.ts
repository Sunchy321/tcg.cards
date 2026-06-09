/**
 * Test search endpoint with POST request
 */

async function testSearchWithPost() {
  console.log(' Testing search endpoint with POST...\n');

  const baseUrl = 'http://localhost:3002';
  
  // Try POST with JSON body
  const requestBody = {
    q: 'fireball',
    lang: 'en',
    page: 1,
    pageSize: 5,
  };

  console.log('Request body:', JSON.stringify(requestBody, null, 2));
  
  const response = await fetch(`${baseUrl}/rpc/hearthstone/search/basic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('\nStatus:', response.status);
  
  const text = await response.text();
  console.log('\nResponse body:');
  
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
    
    if (json.result) {
      console.log('\n✅ SUCCESS! Search is working!');
      console.log('Total results:', json.result.total);
      console.log('First card:', json.result.result?.[0]?.cardId);
      if (json.result.result?.[0]) {
        console.log('Card name:', json.result.result[0].localization?.name);
        console.log('Version field:', json.result.result[0].version);
      }
    } else if (json.json?.message) {
      console.log('\n❌ Error:', json.json.message);
      if (json.json.data?.issues) {
        console.log('Validation issues:', JSON.stringify(json.json.data.issues, null, 2));
      }
    }
  } catch (e) {
    console.log(text.slice(0, 2000));
  }
}

testSearchWithPost().catch(error => {
  console.error('Error:', error);
});

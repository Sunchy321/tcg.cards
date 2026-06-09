/**
 * Test simple endpoint to debug parameter parsing
 */

async function testSimpleEndpoint() {
  console.log(' Testing simple test endpoint...\n');

  const baseUrl = 'http://localhost:3002';
  
  const requestBody = {
    q: 'test',
    lang: 'en',
  };

  console.log('Request body:', JSON.stringify(requestBody, null, 2));
  
  const response = await fetch(`${baseUrl}/rpc/hearthstone/test/testParams`, {
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
      console.log('\n✅ SUCCESS!');
    } else if (json.json?.message) {
      console.log('\n❌ Error:', json.json.message);
    }
  } catch (e) {
    console.log(text.slice(0, 2000));
  }
}

testSimpleEndpoint().catch(error => {
  console.error('Error:', error);
});

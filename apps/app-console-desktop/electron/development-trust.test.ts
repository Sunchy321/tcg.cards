import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { verifyDevelopment } from './development-trust.ts';

test('rejects an arbitrary local HTTP service even on an otherwise acceptable origin', async () => {
  let trusted = false;
  const server = createServer((request, response) => {
    const challenge = new URL(request.url!, 'http://localhost').searchParams.get('challenge')!;
    response.end(
      trusted ? createHmac('sha256', 'test-launch-identity').update(challenge).digest('hex') : 'arbitrary page',
    );
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    await assert.rejects(verifyDevelopment(url, 'test-launch-identity'));
    trusted = true;
    await verifyDevelopment(url, 'test-launch-identity');
    await assert.rejects(verifyDevelopment(url, undefined));
    await assert.rejects(verifyDevelopment(url, 'another-launch'));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
});

test('waits for the current development identity during a server rebuild', async () => {
  let identity = 'previous-launch';
  const server = createServer((request, response) => {
    const challenge = new URL(request.url!, 'http://localhost').searchParams.get('challenge')!;
    response.end(createHmac('sha256', identity).update(challenge).digest('hex'));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let rebuilt: ReturnType<typeof setTimeout> | undefined;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    await assert.rejects(verifyDevelopment(url, 'current-launch'));
    rebuilt = setTimeout(() => {
      identity = 'current-launch';
    }, 150);
    await verifyDevelopment(url, 'current-launch', 1500);
    await assert.rejects(verifyDevelopment(url, 'unrelated-launch', 100));
  } finally {
    clearTimeout(rebuilt);
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
});

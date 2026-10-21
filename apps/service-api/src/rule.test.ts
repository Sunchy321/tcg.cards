import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Isolate external auth and database adapters from other suites' module mocks.
test('rule metadata through the service-api request entry', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./rule.integration.ts', import.meta.url).href)], {
    stdout: 'pipe',
    stderr: 'pipe',
    env:    { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);

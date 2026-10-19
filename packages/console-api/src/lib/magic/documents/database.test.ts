import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Other package tests replace the shared database module globally. Run real SQL
// operations in their own process so those mocks cannot alter the adapter.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL || !process.env.DOCUMENT_TEST_REMOTE_URL)('PostgreSQL document operation integration', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./database.integration.ts', import.meta.url))], {
    stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);

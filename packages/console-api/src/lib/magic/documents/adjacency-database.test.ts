import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Isolate real database imports from global database mocks in other suites.
test.skipIf(!process.env.DOCUMENT_RELATION_TEST_URL)('PostgreSQL adjacent relation operation integration', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./adjacency.integration.ts', import.meta.url))], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);

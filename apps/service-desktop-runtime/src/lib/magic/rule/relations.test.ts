import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Run real worker and SQL operations separately from global mocks in other suites.
test.skipIf(!process.env.RULE_RELATION_TEST_LOCAL_URL)('PostgreSQL relation progress and background task integration', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./relations.integration.ts', import.meta.url))], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);

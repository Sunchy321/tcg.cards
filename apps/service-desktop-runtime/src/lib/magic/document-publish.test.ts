import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// Package tests can replace the shared DB module globally; exercise real tasks in a separate process.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL || !process.env.DOCUMENT_TEST_REMOTE_URL)('PostgreSQL static publication task integration', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./document-publish.integration.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 45000);

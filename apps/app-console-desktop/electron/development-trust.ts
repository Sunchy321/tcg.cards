import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

/** Authenticates the Nuxt instance on each privileged call instead of trusting a port. */
export async function verifyDevelopment(url: string, token: string | undefined, waitMs = 0) {
  const origin = new URL(url);
  if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || !token) {
    throw new Error('无法确认开发服务身份。');
  }
  const deadline = Date.now() + waitMs;
  // Electron can restart before Nitro replaces the previous identity handler.
  // Only startup opts into waiting; privileged IPC still checks immediately.
  for (;;) {
    const challenge = randomBytes(32).toString('hex');
    const endpoint = new URL('/__desktop_identity', origin);
    endpoint.searchParams.set('challenge', challenge);
    try {
      const timeout = waitMs > 0 ? Math.max(1, Math.min(3000, deadline - Date.now())) : 3000;
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeout), redirect: 'error', cache: 'no-store' });
      const actual = Buffer.from(await response.text(), 'hex');
      const expected = createHmac('sha256', token).update(challenge).digest();
      if (response.ok && actual.length === expected.length && timingSafeEqual(actual, expected)) return;
    } catch { /* A rebuilding server may temporarily refuse connections. */ }
    if (Date.now() >= deadline) throw new Error('无法确认开发服务身份。');
    await delay(Math.min(100, deadline - Date.now()));
  }
}

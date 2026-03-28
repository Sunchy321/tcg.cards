import type { Env } from './types';
import { MagicRuleChecker } from './sources/magic/rule';

// Registry of all checkers
const checkers = {
  'magic/rule': new MagicRuleChecker(),
};

async function runAllChecks(env: Env): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting checks...`);

  const results = await Promise.allSettled(
    Object.entries(checkers).map(async ([id, checker]) => {
      console.log(`Running checker: ${id}`);
      return checker.check(env);
    }),
  );

  results.forEach((result, index) => {
    const id = Object.keys(checkers)[index];
    if (result.status === 'fulfilled') {
      console.log(`[${id}] Result:`, result.value.message);
    } else {
      console.error(`[${id}] Error:`, result.reason);
    }
  });

  console.log(`[${new Date().toISOString()}] Checks completed`);
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`[Scheduled] ${new Date().toISOString()}`);
    ctx.waitUntil(runAllChecks(env));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Check environment - only /health is exposed in production
    const isProduction = env.NODE_ENV === 'production';

    // Health check endpoint - always available
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status:   'ok',
          time:     new Date().toISOString(),
          checkers: Object.keys(checkers),
          mode:     isProduction ? 'production' : 'development',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Development-only endpoints (non-production hosts)
    if (!isProduction) {
      // Trigger specific checker
      if (url.pathname.startsWith('/trigger/')) {
        const checkerId = url.pathname.replace('/trigger/', '');
        const checker = checkers[checkerId as keyof typeof checkers];

        if (!checker) {
          return new Response(
            JSON.stringify({ error: `Unknown checker: ${checkerId}` }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }

        ctx.waitUntil(checker.check(env));
        return new Response(
          JSON.stringify({ message: `Triggered: ${checkerId}` }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Test specific checker (dry run, no email sent, no state saved)
      if (url.pathname.startsWith('/test/')) {
        const checkerId = url.pathname.replace('/test/', '');
        const checker = checkers[checkerId as keyof typeof checkers];

        if (!checker) {
          return new Response(
            JSON.stringify({ error: `Unknown checker: ${checkerId}` }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // Run check synchronously to return result
        const result = await checker.check(env, { dryRun: true });
        return new Response(
          JSON.stringify({
            message: `Test completed: ${checkerId}`,
            dryRun:  true,
            result,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Trigger all checkers
      if (url.pathname === '/trigger' && request.method === 'POST') {
        ctx.waitUntil(runAllChecks(env));
        return new Response(
          JSON.stringify({ message: 'All checkers triggered' }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // All other endpoints are hidden (404)
    return new Response('Not Found', { status: 404 });
  },
};

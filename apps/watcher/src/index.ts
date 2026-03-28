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
    })
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
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[Scheduled] ${new Date().toISOString()}`);
    ctx.waitUntil(runAllChecks(env));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          time: new Date().toISOString(),
          checkers: Object.keys(checkers),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Trigger specific checker
    if (url.pathname.startsWith('/trigger/')) {
      const checkerId = url.pathname.replace('/trigger/', '');
      const checker = checkers[checkerId as keyof typeof checkers];

      if (!checker) {
        return new Response(
          JSON.stringify({ error: `Unknown checker: ${checkerId}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      ctx.waitUntil(checker.check(env));
      return new Response(
        JSON.stringify({ message: `Triggered: ${checkerId}` }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Trigger all checkers
    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(runAllChecks(env));
      return new Response(
        JSON.stringify({ message: 'All checkers triggered' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};

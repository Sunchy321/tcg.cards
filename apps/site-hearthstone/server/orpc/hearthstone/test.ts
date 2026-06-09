import { os } from '@orpc/server';
import z from 'zod';

// Simple test endpoint to debug parameter parsing
const testParams = os
  .route({
    method: 'POST',
    description: 'Test parameter parsing',
    tags: ['Test'],
  })
  .input(z.object({
    q: z.string(),
    lang: z.string().default('en'),
  }))
  .output(z.object({
    received: z.object({
      q: z.string(),
      lang: z.string(),
    }),
  }))
  .handler(async ({ input }) => {
    console.log('[test] Received input:', input);
    return {
      received: input,
    };
  });

export const testTrpc = {
  testParams,
};

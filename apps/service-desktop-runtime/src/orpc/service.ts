import { runtimeRouter } from './runtime';

/** Desktop runtime RPC router served from the local Bun process. */
export const router = {
  runtime: runtimeRouter,
};

/** Desktop runtime router type exported for local typed clients. */
export type Router = typeof router;

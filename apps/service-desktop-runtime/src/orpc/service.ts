import { hsdataRouter } from './hsdata';
import { runtimeRouter } from './runtime';
import { tagRouter } from './tag';

/** Desktop runtime RPC router served from the local Bun process. */
export const router = {
  runtime: runtimeRouter,
  hsdata:  hsdataRouter,
  tag:     tagRouter,
};

/** Desktop runtime router type exported for local typed clients. */
export type Router = typeof router;

import { hsdataRouter } from './hsdata';
import { imageRouter } from './image';
import { runtimeRouter } from './runtime';
import { tagRouter } from './tag';
import { testRouter } from './test-task';

/** Desktop runtime RPC router served from the local Bun process. */
export const router = {
  runtime: runtimeRouter,
  hsdata:  hsdataRouter,
  image:   imageRouter,
  tag:     tagRouter,
  test:    testRouter,
};

/** Desktop runtime router type exported for local typed clients. */
export type Router = typeof router;

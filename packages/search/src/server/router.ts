import type { SearchAdapter, QueryRequest } from '#search/logical';
import type { SearchTimingRecorder } from './timing';

/** Uses exact local execution or an explicit candidate verifier before the remote fallback. */
export async function executeLocalExactOrRemote<Result, Options>(input: {
  request:      QueryRequest;
  options:      Options;
  localAdapter: SearchAdapter<Result, Options> | undefined;
  timing?:     SearchTimingRecorder;
  remote:       () => Promise<Result | undefined>;
}): Promise<Result | undefined> {
  const { request, options, localAdapter, timing, remote } = input;
  /** Plans the local route when an adapter is available. */
  const planLocal = () => localAdapter?.plan(request);
  const plan = timing == null
    ? planLocal()
    : timing.measureSync('local-route-selection', planLocal);

  if (localAdapter != null && plan?.type === 'exact') {
    return localAdapter.execute(request, options);
  }

  if (plan?.type === 'candidate' && localAdapter?.executeCandidates != null) {
    return localAdapter.executeCandidates(request, options);
  }

  return remote();
}

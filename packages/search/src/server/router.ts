import type { SearchAdapter, QueryRequest } from '#search/logical';

/** Uses exact local execution or an explicit candidate verifier before the remote fallback. */
export async function executeLocalExactOrRemote<Result, Options>(input: {
  request:      QueryRequest;
  options:      Options;
  localAdapter: SearchAdapter<Result, Options> | undefined;
  remote:       () => Promise<Result | undefined>;
}): Promise<Result | undefined> {
  const { request, options, localAdapter, remote } = input;
  const plan = localAdapter?.plan(request);

  if (localAdapter != null && plan?.type === 'exact') {
    return localAdapter.execute(request, options);
  }

  if (plan?.type === 'candidate' && localAdapter?.executeCandidates != null) {
    return localAdapter.executeCandidates(request, options);
  }

  return remote();
}

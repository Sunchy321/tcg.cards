import type { SearchAdapter, QueryRequest } from '#search/logical';

/** Uses a local dataset only when it can answer the whole request exactly. */
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

  return remote();
}

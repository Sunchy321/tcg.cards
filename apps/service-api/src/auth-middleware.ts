import { getAuth } from './auth';

import type { ApiServiceEnv } from './env';

type VerifyResult = Awaited<ReturnType<ReturnType<typeof getAuth>['api']['verifyApiKey']>>;

const V1_PREFIX = '/v1';
const CATALOG_SEGMENT = 'catalog';

/** Split a request path into its segments (e.g. /v1/magic/catalog/rarity -> ['magic', 'catalog', 'rarity']). */
export function pathSegments(pathname: string): string[] {
  const rest = pathname.startsWith(V1_PREFIX) ? pathname.slice(V1_PREFIX.length) : pathname;

  return rest.split('/').filter(Boolean);
}

/** Constant endpoints (catalog) are open without a key and are CDN-cacheable. */
export function isConstantEndpoint(segments: string[]): boolean {
  return segments[1] === CATALOG_SEGMENT;
}

/** Map a plugin error code to a stable HTTP status. */
function errorStatus(code: string | undefined): number {
  switch (code) {
    case 'KEY_DISABLED':
    case 'KEY_EXPIRED':
      return 403;
    case 'RATE_LIMITED':
    case 'USAGE_EXCEEDED':
      return 429;
    default:
      return 401;
  }
}

/** Verify the request's API key; returns an error Response on failure, null on success. */
export async function authenticate(request: Request, env: ApiServiceEnv): Promise<Response | null> {
  const segments = pathSegments(new URL(request.url).pathname);
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);

  // Constant endpoints are public; a missing key is fine for them.
  if (bearer == null) {
    if (isConstantEndpoint(segments)) {
      return null;
    }

    return new Response(JSON.stringify({
      code:    'UNAUTHORIZED',
      message: 'Missing API key',
    }), {
      status:  401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const game = segments[0];
  const apiKey = bearer[1] ?? '';

  if (apiKey === '') {
    return new Response(JSON.stringify({
      code:    'UNAUTHORIZED',
      message: 'Missing API key',
    }), {
      status:  401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const auth = getAuth(env, { baseURL: new URL(request.url).origin });

  const result = await auth.api.verifyApiKey({
    body: game ? { key: apiKey, permissions: { allowedGames: [game] } } : { key: apiKey },
  }) as VerifyResult;

  if (result.error) {
    return new Response(JSON.stringify({
      code:    result.error.code,
      message: result.error.message,
    }), {
      status:  errorStatus(result.error.code),
      headers: { 'content-type': 'application/json' },
    });
  }

  return null;
}

export const evolveUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const maxAttempts = 3;

/** Structured source error with a stable machine-readable code. */
export class EvolveSourceError extends Error {
  /** Builds one source error with a stable machine-readable code. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EvolveSourceError';
  }
}

/** Sleeps for one backoff or politeness tick. */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Whether one HTTP status should be retried with backoff. */
function isRetryableStatus(status: number) {
  return status === 403 || status === 429 || status >= 500;
}

/** One official Evolve page fetched with retry and backoff, returned as HTML text. */
export async function fetchEvolveHtml(origin: string, path: string, fetcher: typeof fetch = fetch): Promise<string> {
  const url = `${origin}${path}`;
  let lastError: EvolveSourceError = new EvolveSourceError('NETWORK_ERROR', 'request failed.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: {
          accept: 'text/html',
          'user-agent': evolveUserAgent,
        },
      });

      if (!response.ok) {
        lastError = new EvolveSourceError('HTTP_ERROR', `${path} failed with HTTP ${response.status}.`);
        if (!isRetryableStatus(response.status)) {
          throw lastError;
        }
        await sleep(attempt * 1000);
        continue;
      }

      return await response.text();
    } catch (error) {
      if (error instanceof EvolveSourceError && error.code !== 'HTTP_ERROR') {
        throw error;
      }
      lastError = error instanceof EvolveSourceError ? error : new EvolveSourceError('NETWORK_ERROR', error instanceof Error ? error.message : String(error));
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}

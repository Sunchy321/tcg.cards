/** Shared constants for the Konami official-database crawlers (Neuron + CNOCG). */

/** Browser User-Agent sent with every request; the official sites serve plain HTML/JSON. */
export const KONAMI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Hard per-request timeout: a hanging official-site response must not freeze the crawl. */
export const KONAMI_TIMEOUT_MS = 10000;

/**
 * Timeout for Neuron index pages specifically: a single list page is hundreds
 * of kilobytes of server-rendered HTML and can take far longer than the small
 * detail payloads the default timeout is sized for.
 */
export const KONAMI_INDEX_TIMEOUT_MS = 30000;

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import {
  buildImageUrl,
  shadowverseImageSource,
} from './image-config';

import type { ImageAssetKind } from '@tcg-cards/db/schema/local/shadowverse/image-import';
import type { ShadowverseLang } from '#model/shadowverse/schema/data/card-list';

export { shadowverseImageSource };

/** PNG magic bytes every downloaded asset must start with. */
const pngSignature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const maxAssetBytes = 20 * 1024 * 1024;
const maxAttempts = 3;

/** Structured image-source error with a stable machine-readable code. */
export class ImageSourceError extends Error {
  /** Builds one image-source error with a stable machine-readable code. */
  constructor(
    public readonly code: 'HTTP_MISSING' | 'HTTP_ERROR' | 'INVALID_PNG' | 'NETWORK_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'ImageSourceError';
  }
}

/** Whether one HTTP status should be retried with backoff instead of failing fast. */
function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

/** Sleeps for one backoff tick. */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** One PNG asset downloaded and validated against the PNG signature. */
export async function downloadImageAsset(
  lang: ShadowverseLang,
  kind: ImageAssetKind,
  hash: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const url = buildImageUrl(lang, kind, hash);
  let lastError: ImageSourceError = new ImageSourceError('NETWORK_ERROR', 'Image download failed.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetcher(url, {
        headers: {
          accept: 'image/png,image/*;q=0.9',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
      });
    } catch (error) {
      lastError = new ImageSourceError('NETWORK_ERROR', error instanceof Error ? error.message : String(error));
      await sleep(attempt * 1000);
      continue;
    }

    if (response.status === 403 || response.status === 404) {
      throw new ImageSourceError('HTTP_MISSING', `Image ${url} is not available (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      lastError = new ImageSourceError('HTTP_ERROR', `Image ${url} download failed with HTTP ${response.status}.`);
      if (!isRetryableStatus(response.status)) {
        throw lastError;
      }
      await sleep(attempt * 1000);
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.length === 0 || bytes.length > maxAssetBytes) {
      throw new ImageSourceError('INVALID_PNG', `Image ${url} has an unexpected byte size ${bytes.length}.`);
    }

    if (!bytes.subarray(0, pngSignature.length).every((byte, index) => byte === pngSignature[index])) {
      throw new ImageSourceError('INVALID_PNG', `Image ${url} is not a PNG payload.`);
    }

    return bytes;
  }

  throw lastError;
}

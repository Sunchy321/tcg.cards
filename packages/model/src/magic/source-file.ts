import type { SourceFile } from './schema/document-content';

/** Resolves an R2 key against the consuming application's asset origin. */
export function sourceFileUrl(file: SourceFile, assetBaseUrl?: string): string | null {
  const segments = file.storageKey?.split('/');
  if (segments && segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..' && !/[\\\u0000-\u001f]/.test(segment))) {
    if (assetBaseUrl == null) return null;
    const base = new URL(assetBaseUrl);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('Invalid asset base URL');
    }
    return `${base.href.replace(/\/+$/, '')}/${segments.map(encodeURIComponent).join('/')}`;
  }
  return file.sourceUrl ?? null;
}

/** Timeout of one image download; a hung origin must not stall a whole batch. */
const requestTimeoutMs = 60_000;

/** Outcome of one fetch: the body bytes, or why the download failed. */
export type FetchResult = { ok: true, data: Buffer } | { ok: false, error: string };

/** Downloads one image url, keeping the failure reason (timeout, non-2xx, empty body) for the report. */
export async function fetchImageBuffer(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(requestTimeoutMs),
      headers: { 'user-agent': 'tcg-cards/desktop' },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? { ok: true, data: buf } : { ok: false, error: '响应为空' };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { ok: false, error: `下载超时(${requestTimeoutMs / 1000}s)` };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

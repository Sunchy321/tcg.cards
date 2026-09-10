/** Timeout of one image download; a hung origin must not stall a whole batch. */
const requestTimeoutMs = 60_000;

/** Downloads one image url, returning null on any failure (timeout, non-2xx, empty body). */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(requestTimeoutMs),
      headers: { 'user-agent': 'tcg-cards/desktop' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

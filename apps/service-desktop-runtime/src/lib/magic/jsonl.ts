/** Stream JSONL from a plain or gzip file, yielding parsed objects. Bun-native. */
export async function* readJsonl(file: string): AsyncGenerator<Record<string, unknown>> {
  let source = Bun.file(file).stream();
  if (file.endsWith('.gz')) {
    source = source.pipeThrough(new DecompressionStream('gzip'));
  }

  const reader = source.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) continue;
      try {
        yield JSON.parse(line);
      } catch { /* skip malformed lines */ }
    }
  }
}

/** Map a snake_case object to a target shape via an explicit key map. */
export function pickSnake<T extends Record<string, unknown>>(
  obj: Record<string, unknown>,
  map: Record<keyof T, string>,
): T {
  const out = {} as T;
  for (const key of Object.keys(map) as (keyof T)[]) {
    const from = map[key];
    const value = obj[from];
    out[key] = (value === undefined ? null : value) as T[keyof T];
  }
  return out;
}

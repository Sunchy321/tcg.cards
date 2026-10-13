/**
 * Parse one JSONL line, or null when unparseable. MTGCH exports double-escape
 * quotes inside strings (`\\"` where `\"` is meant), so every row whose text
 * contains a quote fails strict JSON; those lines are retried once with the
 * over-escaping collapsed before being given up on.
 */
export function parseJsonlLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(line.replace(/\\\\"/g, '\\"')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

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
      const parsed = parseJsonlLine(line);
      if (parsed != null) yield parsed;
    }
  }
}

/** Counts JSONL lines in a plain or gzip file with a streaming pass. */
export async function countJsonlLines(file: string): Promise<number> {
  let source = Bun.file(file).stream();
  if (file.endsWith('.gz')) {
    source = source.pipeThrough(new DecompressionStream('gzip'));
  }

  const reader = source.getReader();
  const decoder = new TextDecoder();
  let lines = 0;
  let trailing = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = trailing + decoder.decode(value, { stream: true });
    lines += text.split('\n').length - 1;
    trailing = text.slice(text.lastIndexOf('\n') + 1);
  }
  return lines + (trailing.length > 0 ? 1 : 0);
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

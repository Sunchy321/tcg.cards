/**
 * Parse one JSONL line, or null when unparseable. MTGCH exports double-escape
 * quotes inside strings (`\\"` where `\"` is meant), so every row whose text
 * contains a quote fails strict JSON; those lines are retried once with the
 * over-escaping collapsed before being given up on.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
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

/** Streams JSONL from a plain or gzip file, yielding parsed objects. */
export async function* readJsonl(file: string): AsyncGenerator<Record<string, unknown>> {
  const source = createReadStream(file);
  const input = file.endsWith('.gz') ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length === 0) continue;
    const parsed = parseJsonlLine(line);
    if (parsed != null) yield parsed;
  }
}

/** Counts JSONL lines in a plain or gzip file with a streaming pass. */
export async function countJsonlLines(file: string): Promise<number> {
  const source = createReadStream(file);
  const input = file.endsWith('.gz') ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  for await (const _line of lines) count++;
  return count;
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

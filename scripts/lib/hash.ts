import { createHash } from 'node:crypto';

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Serializes a value into deterministic JSON for hash input. */
export function canonicalizeJson(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalizeJson(item)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(',')}}`;
}

/** Returns the SHA-256 hex digest of the canonical JSON form of a value. */
export function hashCanonicalJson(value: unknown): string {
  return sha256(canonicalizeJson(value));
}

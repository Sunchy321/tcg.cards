import canonicalize from 'canonicalize';

export function hashCanonicalJson(value: unknown): string {
  return Bun.SHA256.hash(canonicalize(value)!, 'hex') as string;
}

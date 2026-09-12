/** Documentation versions served at /v{1..N}. The root path aliases the latest. */
export const DOC_VERSIONS = ['v1'] as const;

export type DocVersion = (typeof DOC_VERSIONS)[number];

/** Extracts the version segment from a path, if present (e.g. /v1/magic/... -> v1). */
export function versionFromPath(path: string): DocVersion | null {
  const first = path.split('/').filter(Boolean)[0];
  return (DOC_VERSIONS as readonly string[]).includes(first) ? first as DocVersion : null;
}

/** Swaps the version prefix of a path (e.g. /v1/magic/card -> /v2/magic/card). */
export function withVersion(path: string, version: DocVersion): string {
  const current = versionFromPath(path);
  if (current === null) {
    return `/${version}${path}`;
  }
  const rest = path.slice(`/${current}`.length);
  return `/${version}${rest}`;
}

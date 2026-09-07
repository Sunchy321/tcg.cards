/** Naming pattern of one archive image entry. */
export type ImageNameKind = 'face' | 'named' | 'plain';

/** One archive image entry name resolved into import fields. */
export interface ParsedImageName {
  /** Full entry filename including directory segments. */
  filename: string;
  kind:     ImageNameKind;
  /** Collector number as written in the filename. */
  number:   string;
  /** Trailing `-N` face index of multi-face images. */
  faceIndex?: number;
  /** Card name after the separator of `number<sep>name` filenames. */
  name?:      string;
}

/** Smallest share of entries one naming pattern must cover to be selected automatically. */
export const namingCoverageThreshold = 0.95;

const facePattern = /^(?<number>.*\d.*)-(?<face>\d+)$/;
const namedPattern = /^(?<number>.*\d.*?)(?<separator>[#_ ]+)(?<name>.+)$/;
const plainPattern = /^\d+[a-z]?$/i;

/** Strips the directory prefix and file extension of an archive entry filename. */
export function stemOf(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}

/** Parses one archive entry stem into its naming pattern, or null when unrecognizable. */
export function parseImageStem(stem: string): ParsedImageName | null {
  const clean = stem.trim();
  const face = facePattern.exec(clean);
  if (face?.groups) return { filename: stem, kind: 'face', number: face.groups.number, faceIndex: Number(face.groups.face) };
  const named = namedPattern.exec(clean);
  if (named?.groups) return { filename: stem, kind: 'named', number: named.groups.number.trim(), name: named.groups.name.trim() };
  if (plainPattern.test(clean)) return { filename: stem, kind: 'plain', number: clean };
  return null;
}

/**
 * Picks the dominant naming pattern when it covers at least `coverage` of the
 * parsed entries; unparsed stems are decided by the caller. Returns null when
 * no pattern reaches the threshold, meaning the archive must not be guessed.
 */
export function chooseNamingPattern(parsed: ParsedImageName[], coverage: number = namingCoverageThreshold): ImageNameKind | null {
  if (parsed.length === 0) return null;
  const counts: Record<ImageNameKind, number> = { face: 0, named: 0, plain: 0 };
  for (const item of parsed) counts[item.kind]! += 1;
  const best = (Object.entries(counts) as [ImageNameKind, number][])
    .sort((a, b) => b[1] - a[1])[0]!;
  return best[1] / parsed.length >= coverage ? best[0] : null;
}

/**
 * Database matching candidates for a written collector number: the raw text
 * plus the leading-zero-stripped form (`001` also matches `1`, `012a` also
 * matches `12a`). Plain `0` stays as-is.
 */
export function numberCandidates(number: string): string[] {
  const raw = number.trim();
  const stripped = raw.replace(/^0+(?=\d)/, '');
  return stripped === raw ? [raw] : [raw, stripped];
}

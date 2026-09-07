/** Naming pattern of one archive image entry. */
export type ImageNameKind = 'face' | 'named' | 'plain';

/** Archive-wide naming convention, including the storage-mirroring tree layout. */
export type ZipConvention = ImageNameKind | 'tree';

/** One archive image entry name resolved into import fields. */
export interface ParsedImageName {
  /** Full entry filename including directory segments. */
  filename:   string;
  kind:       ImageNameKind;
  /** Collector number as written in the filename. */
  number:     string;
  /** Trailing `-N` face index of multi-face images. */
  faceIndex?: number;
  /** Card name after the separator of `number<sep>name` filenames. */
  name?:      string;
}

/** One archive entry resolved through the storage-mirroring tree layout. */
export interface ParsedTreeEntry {
  filename:   string;
  set:        string;
  lang:       string;
  number:     string;
  faceIndex?: number;
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
  // The canonical back-face mark (storage convention), accepted as an input too.
  if (clean.endsWith('⁑')) return { filename: stem, kind: 'face', number: clean.slice(0, -1), faceIndex: 1 };
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

/** Resolves one entry as a storage-tree path `{root…}/{set}/{lang}/{number[-face]}.ext`, or null. */
export function parseTreeEntryPath(filename: string, validLangs: ReadonlySet<string>): ParsedTreeEntry | null {
  const segments = filename.split('/');
  if (segments.length < 3) return null;
  const file = segments[segments.length - 1]!;
  const lang = segments[segments.length - 2]!;
  const set = segments[segments.length - 3]!;
  // The language segment must be a real locale and the set segment a plausible
  // code; together they rule out coincidental flat names inside subdirectories.
  if (!validLangs.has(lang) || !/^[a-z0-9]+$/.test(set)) return null;
  const stem = stemOf(file);
  const face = /^(?<number>.+)-(?<face>\d+)$/.exec(stem);
  if (face?.groups != null) {
    return { filename, set, lang, number: face.groups.number, faceIndex: Number(face.groups.face) };
  }
  if (stem.endsWith('⁑')) {
    return { filename, set, lang, number: stem.slice(0, -1), faceIndex: 1 };
  }
  return { filename, set, lang, number: stem, faceIndex: undefined };
}

/**
 * Parses the whole archive as a storage tree layout when at least `coverage`
 * of the image entries resolve as tree paths; null otherwise. Leading path
 * segments (e.g. `large/`) are ignored, mirroring the canonical image root.
 */
export function parseTreeLayout<T extends { filename: string }>(entries: T[], validLangs: ReadonlySet<string>, coverage: number = namingCoverageThreshold): ParsedTreeEntry[] | null {
  if (entries.length === 0) return null;
  const parsed = entries
    .map(entry => parseTreeEntryPath(entry.filename, validLangs))
    .filter((entry): entry is ParsedTreeEntry => entry != null);
  return parsed.length / entries.length >= coverage ? parsed : null;
}

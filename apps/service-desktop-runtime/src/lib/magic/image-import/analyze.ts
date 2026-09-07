import { and, desc, inArray, isNull, sql } from 'drizzle-orm';
import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { Set as MagicSet } from '@tcg-cards/db/schema/shared/magic/set';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { chooseNamingPattern, numberCandidates, parseImageStem, stemOf } from './parse';
import type { ImageNameKind } from './parse';
import { listZipImages } from './zip';
import type { ZipImageInfo } from './zip';

/** One inferred set/lang target with its combined match rate (0-1). */
export interface ImportZipCandidate {
  set:  string;
  lang: string;
  rate: number;
}

/** Result of analyzing one import archive without extracting any image data. */
export interface ImportZipAnalysis {
  /** Selected naming convention; null when no pattern reaches the coverage threshold. */
  convention:   ImageNameKind | null;
  /** Total image entry count of the archive. */
  entryCount:   number;
  /** Entries outside the selected naming convention (capped list). */
  unrecognized: string[];
  /** set/lang candidates ordered by combined match rate. */
  candidates:   ImportZipCandidate[];
}

/** Score bonus for a candidate whose set code matches the zip/ directory name signal. */
const filenameHintBonus = 0.25;
/** Upper bound of distinct card names fed into one inference query. */
const maxQueryNames = 500;
/** Upper bound of set/lang candidates returned to the caller. */
const maxCandidates = 8;
/** Upper bound of unrecognized names returned to the caller. */
const maxUnrecognized = 50;

/** Lowercase archive-name hints: the zip file name plus top-level entry directories. */
function archiveNameHints(zipPath: string, selected: { info: ZipImageInfo }[]): string[] {
  const zipBase = zipPath.split('/').pop() ?? zipPath;
  const hints = new Set<string>([zipBase.replace(/\.[^.]+$/, '').toLowerCase()]);
  for (const { info } of selected) {
    const segments = info.filename.split('/');
    if (segments.length > 1) {
      const top = segments[0]!.toLowerCase();
      if (top.length > 0 && !top.startsWith('_') && top !== '__macosx') hints.add(top);
    }
  }
  return [...hints].filter(hint => hint.length > 0);
}

interface CandidateScore {
  set:       string;
  lang:      string;
  nameHits:  number;
  numberHits: number;
  hint:      boolean;
}

/** Infers the naming convention and set/lang candidates of an import zip against the local prints. */
export async function analyzeImportZip(db: LocalDb, zipPath: string): Promise<ImportZipAnalysis> {
  const infos = await listZipImages(zipPath);
  const parsed = infos
    .flatMap(info => {
      const parsedName = parseImageStem(stemOf(info.filename));
      return parsedName == null ? [] : [{ info, parsedName }];
    });
  const convention = chooseNamingPattern(parsed.map(item => item.parsedName));
  const selectedFilenames = new Set(
    parsed.filter(item => item.parsedName.kind === convention).map(item => item.info.filename),
  );
  const unrecognized = infos
    .map(info => info.filename)
    .filter(filename => !selectedFilenames.has(filename))
    .slice(0, maxUnrecognized);

  if (convention == null) return { convention, entryCount: infos.length, unrecognized: [], candidates: [] };

  const selected = parsed.filter(item => item.parsedName.kind === convention);
  const names = [...new Set(selected.map(item => item.parsedName.name).filter((name): name is string => !!name))].slice(0, maxQueryNames);
  const numbers = [...new Set(selected.flatMap(item => numberCandidates(item.parsedName.number)))];
  const entryNumberCount = new Set(selected.map(item => item.parsedName.number)).size;

  // Name signal: highly selective, ranks (set, lang) pairs by how many archive
  // names appear as print names of that pair.
  const nameRanking = names.length === 0
    ? []
    : await runWithDb(db, () => db.select({
        set:  Print.set,
        lang: Print.lang,
        hits: sql<number>`count(distinct ${Print.name})::int`,
      }).from(Print).where(and(
        isNull(Print.deletedAt),
        inArray(Print.name, names),
      )).groupBy(Print.set, Print.lang).orderBy(desc(sql`count(distinct ${Print.name})`)).limit(20));

  // Filename signal: zip file name and top-level directory names matched
  // against set codes; matching sets contribute their language list.
  const hints = archiveNameHints(zipPath, selected);
  const hintSets = hints.length === 0
    ? []
    : await runWithDb(db, () => db.select({
        code: MagicSet.scryfallCode,
        langs: MagicSet.langs,
      }).from(MagicSet).where(inArray(sql`lower(${MagicSet.scryfallCode})`, hints)));

  // Number signal: how many archive numbers exist as collector numbers of
  // each candidate (set, lang) pair.
  const verifySets = new Set<string>([...nameRanking.map(row => row.set), ...hintSets.map(row => row.code)]);
  const numberRanking = verifySets.size === 0 || numbers.length === 0
    ? []
    : await runWithDb(db, () => db.select({
        set:  Print.set,
        lang: Print.lang,
        hits: sql<number>`count(distinct ${Print.number})::int`,
      }).from(Print).where(and(
        isNull(Print.deletedAt),
        inArray(Print.set, [...verifySets]),
        inArray(Print.number, numbers),
      )).groupBy(Print.set, Print.lang));

  const scores = new Map<string, CandidateScore>();
  const scoreOf = (set: string, lang: string): CandidateScore => {
    const key = `${set}|${lang}`;
    let score = scores.get(key);
    if (!score) {
      score = { set, lang, nameHits: 0, numberHits: 0, hint: false };
      scores.set(key, score);
    }
    return score;
  };
  for (const row of nameRanking) scoreOf(row.set, row.lang).nameHits = row.hits;
  for (const row of numberRanking) scoreOf(row.set, row.lang).numberHits = row.hits;
  for (const row of hintSets) for (const lang of row.langs) scoreOf(row.code, lang).hint = true;

  const candidates = [...scores.values()]
    .map(score => {
      const nameRate = names.length === 0 ? 0 : score.nameHits / names.length;
      const numberRate = entryNumberCount === 0 ? 0 : score.numberHits / entryNumberCount;
      const rate = Math.min(1, (nameRate + numberRate) / 2 + (score.hint ? filenameHintBonus : 0));
      return { set: score.set, lang: score.lang, rate };
    })
    .filter(candidate => candidate.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, maxCandidates);

  return { convention, entryCount: infos.length, unrecognized, candidates };
}

import type { PrintCommitFace, PrintCommitMetadata } from '@tcg-cards/db/schema/local/magic';

import type { PrintDraft } from './project-card';

/**
 * Print-commit synthesis: reviewed `magic_data.print_commits` rows become
 * additional print drafts of their oracle's unit. Pure — the caller loads the
 * commits and passes them in, so golden fixtures can pin the behaviour
 * offline.
 */

/** PK `source` value of a fact print row synthesized from a print commit. */
export const MANUAL_PRINT_SOURCE = 'manual';

/** Image status of a synthesized print before the asset ledger says otherwise. */
const COMMITTED_IMAGE_STATUS = 'missing';

/** One reviewed print commit, reduced to what synthesis consumes. */
export interface LoadedPrintCommit {
  set:      string;
  number:   string;
  lang:     string;
  faces:    PrintCommitFace[];
  metadata: PrintCommitMetadata | null;
}

/**
 * The English print at the commit's position — the clone baseline for every
 * physical attribute the commit does not assert. Strictly same-position: a
 * commit whose position has no English row is skipped rather than dressed in
 * another position's metadata. Split double-faced tokens never reach here
 * (their units are out of the commit path's scope).
 */
function baselineFor(basePrints: PrintDraft[], commit: LoadedPrintCommit): PrintDraft | null {
  return basePrints.find(d => d.lang === 'en' && d.set === commit.set && d.number === commit.number)
    ?? null;
}

/** Merges one commit face onto its baseline slot; commit values win, absences clone. */
function mergedFace(base: PrintDraft['faces'][number] | undefined, commit: PrintCommitFace | undefined) {
  return {
    typeLine:         commit?.printedTypeLine ?? base?.typeLine ?? null,
    printedName:      commit?.printedName ?? base?.printedName ?? null,
    printedTypeLine:  commit?.printedTypeLine ?? base?.printedTypeLine ?? null,
    printedText:      commit?.printedText ?? base?.printedText ?? null,
    flavorName:       commit?.flavorName ?? base?.flavorName ?? null,
    flavorText:       commit?.flavorText ?? base?.flavorText ?? null,
    artist:           commit?.artist ?? base?.artist ?? null,
    watermark:        commit?.watermark ?? base?.watermark ?? null,
    illustrationId:   base?.illustrationId ?? null,
    attractionLights: base?.attractionLights ?? null,
  };
}

/**
 * Builds the manual print drafts for one unit from the unit's source-derived
 * base prints. A commit with no same-position English print to clone from is
 * skipped — its row persists unprojected, and the entry surfaces validate
 * positions before review, so this only shields the projection from a stray
 * hand-entered commit rather than dropping data.
 */
export function synthesizePrintCommits(basePrints: PrintDraft[], commits: LoadedPrintCommit[]): PrintDraft[] {
  const out: PrintDraft[] = [];
  for (const commit of commits) {
    const baseline = baselineFor(basePrints, commit);
    if (baseline == null) continue;
    out.push({
      ...baseline,
      lang:   commit.lang,
      set:    commit.set,
      number: commit.number,

      // The committed position has no object of its own in any upstream id
      // space; identity columns stay empty instead of borrowing the English
      // print's.
      scryfallCardId:    null,
      scryfallFace:      null,
      arenaId:           null,
      mtgoId:            null,
      mtgoFoilId:        null,
      multiverseIds:     [],
      tcgPlayerId:       null,
      tcgplayerEtchedId: null,
      cardMarketId:      null,
      previewDate:       null,
      previewSource:     null,
      previewUri:        null,

      imageStatus: COMMITTED_IMAGE_STATUS,

      ...commit.metadata != null
        ? {
          rarity:        commit.metadata.rarity ?? baseline.rarity,
          releasedAt:    commit.metadata.releaseDate ?? baseline.releasedAt,
          frame:         commit.metadata.frame ?? baseline.frame,
          borderColor:   commit.metadata.borderColor ?? baseline.borderColor,
          securityStamp: commit.metadata.securityStamp ?? baseline.securityStamp,
          finishes:      commit.metadata.finishes ?? baseline.finishes,
          isDigital:     commit.metadata.isDigital ?? baseline.isDigital,
          isPromo:       commit.metadata.isPromo ?? baseline.isPromo,
          inBooster:     commit.metadata.inBooster ?? baseline.inBooster,
          promoTypes:    commit.metadata.promoTypes ?? baseline.promoTypes,
          artistIds:     commit.metadata.artistIds ?? baseline.artistIds,
        }
        : {},

      // Face slots align with the unit's faces; commit slots beyond the face
      // count have nothing to attach to and are ignored.
      faces: Array.from({ length: baseline.faces.length }, (_, i) =>
        mergedFace(baseline.faces[i], commit.faces[i])),

      // The committed surface is self-contained: no community attach, and the
      // row identifies itself in the fact table's PK.
      source: MANUAL_PRINT_SOURCE,
    });
  }
  return out;
}

/** `cardId|set|number|lang` identity of one manual print position. */
export function manualPrintKey(row: { cardId: string, set: string, number: string, lang: string }): string {
  return `${row.cardId}|${row.set}|${row.number}|${row.lang}`;
}

/**
 * Active manual print positions this run did not emit — the recycle set.
 * Taking the emitted keys (instead of recomputing expectations from commits)
 * keeps the recycle symmetric with synthesis by construction: whatever the
 * commit path skipped, it also no longer holds onto.
 */
export function staleManualPrints(
  active: { cardId: string, set: string, number: string, lang: string }[],
  emitted: Set<string>,
): { cardId: string, set: string, number: string, lang: string }[] {
  return active.filter(r => !emitted.has(manualPrintKey(r)));
}

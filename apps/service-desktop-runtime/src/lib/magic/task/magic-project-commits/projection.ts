import { runWithDb } from '@tcg-cards/db';

import { matchBatch } from '../../match';
import { loadNameRubyLookup } from '../../name-ruby';
import { loadReversibleRows, type ProjectDb } from '../../project/assemble';
import {
  loadPrintCommits,
  projectOraclePrints,
  softDeleteStaleManualPrints,
} from '../magic-project/oracle-prints';

/** Result counts of one commits-only projection pass. */
export interface CommitsProjectionResult {
  oracles:        number;
  unresolved:     number;
  prints:         number;
  printParts:     number;
  manualRecycled: number;
}

/** Card scope of a commits-only projection: the requested oracles' resolved
 * cards, every oracle with a unit on those cards, and how many requested
 * oracles resolved to nothing (their commits stay unprojected). */
export interface CommitScope {
  cardIdScope: Set<string>;
  oracleList:  string[];
  unresolved:  number;
}

/** The oracle part of a unit key (`oracleId`, or `oracleId:faceIndex` for a DFT face). */
function oracleOfUnit(unit: string): string {
  return unit.includes(':') ? unit.slice(0, unit.indexOf(':')) : unit;
}

export function resolveCommitScope(unitToCard: Map<string, string>, oracleIds: string[]): CommitScope {
  const requested = new Set(oracleIds);
  const requestedUnits = [...unitToCard.keys()].filter(k => requested.has(oracleOfUnit(k)));
  const cardIdScope = new Set(requestedUnits.map(u => unitToCard.get(u)!));
  // A merged card's manual prints can come from sibling oracles' commits, so
  // the scope projects every oracle on the scoped cards — that keeps the
  // recycle exactly as wide as what the whole card would emit.
  const oracleList = [...new Set([...unitToCard.entries()]
    .filter(([, cardId]) => cardIdScope.has(cardId))
    .map(([unit]) => oracleOfUnit(unit)))].sort();
  const unresolved = [...requested].filter(o => !requestedUnits.some(u => oracleOfUnit(u) === o)).length;
  return { cardIdScope, oracleList, unresolved };
}

/**
 * Runs a commits-only projection synchronously: match in full, project the
 * scoped cards' print-level facts, then recycle withdrawn manual positions
 * within the scope. The task-typed run shares the scope resolution and the
 * per-oracle writer; this direct pass serves single-commit projections, where
 * a task run would cost more than the work itself.
 */
export async function runCommitsProjection(database: ProjectDb, oracleIds: string[]): Promise<CommitsProjectionResult> {
  return runWithDb(database, async () => {
    const matched = await matchBatch(database);
    const scope = resolveCommitScope(matched.cardIdByUnit, oracleIds);
    const reversibleRows = await loadReversibleRows(database);
    const rubies = await loadNameRubyLookup(database);
    const printCommits = await loadPrintCommits(database);

    let prints = 0;
    let printParts = 0;
    const manualKeys = new Set<string>();
    for (const oracle of scope.oracleList) {
      const wrote = await projectOraclePrints(database, oracle, {
        unitToCard: matched.cardIdByUnit,
        reversibleRows,
        rubies,
        printCommits,
      });
      prints += wrote.prints;
      printParts += wrote.printParts;
      for (const key of wrote.manualKeys) manualKeys.add(key);
    }
    const manualRecycled = await softDeleteStaleManualPrints(database, manualKeys, scope.cardIdScope);
    return {
      oracles:    scope.oracleList.length,
      unresolved: scope.unresolved,
      prints,
      printParts,
      manualRecycled,
    };
  });
}

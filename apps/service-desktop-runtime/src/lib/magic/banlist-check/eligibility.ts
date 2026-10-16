import { pauperEligible, type ApplyCardMeta } from '../announcement/apply';

/** Print metadata needed to scope collective restrictions to an actual card pool. */
export interface GroupCardMeta extends ApplyCardMeta {
  games: string[];
}

/** Applies the replay's rarity/set rules and Arena availability before expanding global restrictions. */
export function groupEligibility(
  formats: { formatId: string, sets: string[] | null }[],
  cardIds: string[],
  metadata: ReadonlyMap<string, GroupCardMeta>,
): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {};
  for (const format of formats) {
    result[format.formatId] = new Set(cardIds.filter(cardId => {
      const meta = metadata.get(cardId);
      if (!meta || !pauperEligible(meta, format.formatId)) return false;
      if (format.sets != null && !meta.sets.some(set => format.sets!.includes(set))) return false;
      // These formats use Arena's card pool even when the local format does not track individual sets.
      if (['alchemy', 'historic', 'timeless', 'brawl', 'standard-brawl'].includes(format.formatId) && !meta.games.includes('arena')) return false;
      return true;
    }));
  }
  return result;
}

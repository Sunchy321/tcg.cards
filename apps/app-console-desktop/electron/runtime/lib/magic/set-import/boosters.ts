import { z } from 'zod';
import type { Booster } from '@tcg-cards/db/schema/shared/magic/set';
import type { PrintIdentity, SourceCard } from './store';

/** Complete replacement payload for every booster belonging to one series. */
export type BoosterRows = (typeof Booster.$inferInsert)[];
/** Resolves source UUIDs only when they name one unambiguous current local print. */
export type PrintLookup = (uuid: string) => PrintIdentity;

/** Distinguishes safe product-language source failures from internal storage errors. */
class BoosterDataError extends Error {}

/** Builds the UUID bridge once for all series without silently choosing ambiguous print faces. */
export function createPrintLookup(cards: SourceCard[], prints: PrintIdentity[]): PrintLookup {
  const source = new Map<string, Map<string, { scryfallId: string, face: string | null }>>();
  const local = new Map<string, Map<string, PrintIdentity>>();
  for (const card of cards) {
    // Only reversible art variants split into separate local face prints;
    // ordinary transforming cards retain one print for both source sides.
    const face = card.layout === 'reversible_card'
      ? card.side === 'a' ? 'front' : card.side === 'b' ? 'back' : null
      : null;
    const ids = source.get(card.uuid) ?? new Map();
    ids.set(JSON.stringify([card.scryfallId, face]), { scryfallId: card.scryfallId, face });
    source.set(card.uuid, ids);
  }
  for (const print of prints) {
    if (!print.scryfallId) continue;
    const matches = local.get(print.scryfallId) ?? new Map<string, PrintIdentity>();
    matches.set(JSON.stringify([print.cardId, print.set, print.number, print.lang]), print);
    local.set(print.scryfallId, matches);
  }
  return uuid => {
    const ids = source.get(uuid);
    if (!ids || ids.size !== 1) throw new BoosterDataError('部分卡牌缺少明确的来源对应关系。');
    const identity = [...ids.values()][0]!;
    const matches = [...(local.get(identity.scryfallId)?.values() ?? [])]
      .filter(print => identity.face === null || print.scryfallFace === identity.face);
    if (matches.length !== 1) throw new BoosterDataError('部分卡牌未找到唯一的本地印刷。');
    return matches[0]!;
  };
}

/** MTGJSON's weights remain integers throughout validation and persistence. */
const weight = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Source pack distribution with sheet names as its card-slot keys. */
const boosterConfig = z.object({
  boostersTotalWeight: weight.max(2_147_483_647),
  boosters:            z.array(z.object({ weight: weight.max(2_147_483_647), contents: z.record(z.string(), z.number().int().nonnegative()) })).min(1),
  sheets:              z.record(z.string(), z.object({
    totalWeight:     weight, cards:           z.record(z.string(), weight), foil:            z.boolean(),
    allowDuplicates: z.boolean().optional(), balanceColors:   z.boolean().optional(), fixed:           z.boolean().optional(),
  })),
});

/** Validates and resolves every source card before replacing any stored booster rows. */
export function buildBoosters(setId: string, raw: unknown, lookup: PrintLookup): BoosterRows {
  const source = z.object({ booster: z.record(z.string(), boosterConfig).optional() }).parse(raw);
  const result: BoosterRows = [];
  for (const [code, config] of Object.entries(source.booster ?? {})) {
    if (config.boosters.reduce((sum, pack) => sum + pack.weight, 0) !== config.boostersTotalWeight) {
      throw new BoosterDataError('补充包总权重与组成不一致。');
    }
    const sheets = Object.entries(config.sheets).map(([typeId, sheet]) => {
      if (Object.values(sheet.cards).reduce((sum, value) => sum + value, 0) !== sheet.totalWeight) {
        throw new BoosterDataError('补充包卡牌总权重与组成不一致。');
      }
      return {
        typeId,
        totalWeight:     sheet.totalWeight,
        isFoil:          sheet.foil,
        isFixed:         sheet.fixed ?? false,
        allowDuplicates: sheet.allowDuplicates ?? false,
        balanceColors:   sheet.balanceColors ?? false,
        cards:           Object.entries(sheet.cards).map(([uuid, cardWeight]) => {
          const print = lookup(uuid);
          return { cardId: print.cardId, set: print.set, number: print.number, lang: print.lang, weight: cardWeight };
        }),
      };
    });
    const packs = config.boosters.map(pack => ({
      weight:   pack.weight,
      contents: Object.entries(pack.contents).map(([type, count]) => {
        if (!config.sheets[type]) throw new BoosterDataError('补充包缺少部分卡位的卡牌清单。');
        return { type, count };
      }),
    }));
    result.push({ setId, boosterId: code, totalWeight: config.boostersTotalWeight, packs, sheets });
  }
  return result;
}

/** Per-series replacement results, including failures retained for the final task report. */
export interface BoosterReport { updated: number, failed: { setId: string, message: string }[], missing: string[] }
/** External storage boundary for processing one complete series at a time. */
export interface BoosterStore {
  read(setId: string): Promise<unknown | undefined>;
  replace(setId: string, rows: BoosterRows): Promise<void>;
}

/** Continues after a series failure without committing partial replacement payloads. */
export async function updateBoosters(setIds: string[], store: BoosterStore, lookup: PrintLookup): Promise<BoosterReport> {
  const report: BoosterReport = { updated: 0, failed: [], missing: [] };
  for (const setId of setIds) {
    try {
      const raw = await store.read(setId);
      if (raw === undefined) {
        report.missing.push(setId);
        continue;
      }
      const rows = buildBoosters(setId, raw, lookup);
      await store.replace(setId, rows);
      report.updated++;
    } catch (error) {
      console.error('[magic:set-import] Booster series failed', setId, error);
      report.failed.push({ setId, message: error instanceof z.ZodError
        ? '补充包资料不完整，请重新导入来源数据。'
        : error instanceof BoosterDataError ? error.message : '补充包资料暂时无法更新，请稍后重试。' });
    }
  }
  return report;
}

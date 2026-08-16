import { and, eq, inArray } from 'drizzle-orm';

import { computeRenderHash } from '@tcg-cards/shared/hearthstone/render-hash';
import { sortGlow } from '@tcg-cards/shared/hearthstone/glow';

import type { RenderModel } from '#model/hearthstone/schema/entity';
import type { GlowEntry } from '#model/hearthstone/schema/announcement';
import type { Locale } from '#model/hearthstone/schema/basic';

import { db } from '#db/db';
import { EntityLocalization } from '#schema/shared/hearthstone';

export interface AnnouncementItemImage {
  side:     string;
  hash:     string;
  category: 'base' | 'glow';
  template: string;
}

export interface AnnouncementImageItem {
  id:                      string;
  type:                    string;
  cardId:                  string | null;
  format:                  string | null;
  version:                 number | null;
  lastVersion:             number | null;
  delta:                   { prev?: Record<string, unknown>, curr?: Record<string, unknown> } | null;
  glow:                    GlowEntry[] | null;
  announcementVersion:     number;
  announcementLastVersion: number | null;
}

/** Resolves the render hash for each renderable side of card-level announcement items. */
export async function resolveAnnouncementItemImages(
  items: AnnouncementImageItem[],
  lang: Locale,
): Promise<Map<string, AnnouncementItemImage[]>> {
  const result = new Map<string, AnnouncementItemImage[]>();
  const cardIds = [...new Set(items.filter(item => item.cardId).map(item => item.cardId!))];
  if (cardIds.length === 0) return result;

  const rows = await db.select({
    cardId:      EntityLocalization.cardId,
    version:     EntityLocalization.version,
    renderModel: EntityLocalization.renderModel,
  })
    .from(EntityLocalization)
    .where(and(inArray(EntityLocalization.cardId, cardIds), eq(EntityLocalization.lang, lang)));

  const byCard = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCard.get(row.cardId) ?? [];
    list.push(row);
    byCard.set(row.cardId, list);
  }

  const modelAt = (cardId: string, build: number): RenderModel | null => {
    const candidates = byCard.get(cardId) ?? [];
    return candidates.find(row => row.version.includes(build))?.renderModel ?? null;
  };

  const templateOf = (format: string | null) => format === 'battlegrounds' ? 'battlegrounds' : 'normal';
  const mergedOf = (model: RenderModel, delta?: Record<string, unknown>) => ({ ...model, ...(delta ?? {}) }) as RenderModel;

  for (const item of items) {
    if (!item.cardId) continue;
    const template = templateOf(item.format);
    const sides: AnnouncementItemImage[] = [];

    if (item.type === 'card_change') {
      const build = item.version ?? item.announcementVersion;
      const model = modelAt(item.cardId, build);
      if (model) {
        sides.push({ side: 'base', hash: computeRenderHash(mergedOf(model, item.delta?.curr)), category: 'base', template });
      }
    } else if (item.type === 'card_update') {
      const currBuild = item.version ?? item.announcementVersion;
      const prevBuild = item.lastVersion ?? item.announcementLastVersion ?? item.announcementVersion;
      const prevModel = modelAt(item.cardId, prevBuild);
      if (prevModel) {
        sides.push({ side: 'prev', hash: computeRenderHash(mergedOf(prevModel, item.delta?.prev)), category: 'base', template });
      }
      const currModel = modelAt(item.cardId, currBuild);
      if (currModel) {
        const merged = mergedOf(currModel, item.delta?.curr);
        const hasGlow = item.glow != null && item.glow.length > 0;
        if (hasGlow) merged.glow = sortGlow(item.glow!);
        sides.push({ side: 'curr', hash: computeRenderHash(merged), category: hasGlow ? 'glow' : 'base', template });
      }
    }

    result.set(item.id, sides);
  }

  return result;
}

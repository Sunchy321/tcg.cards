export interface AnnouncementSide {
  side:     string;
  hash:     string;
  category: string;
  template: string;
}

export interface UpdateSourceItem {
  id:                string;
  type:              string;
  format:            string | null;
  status:            string | null;
  cardId:            string | null;
  relatedCards:      string[];
  relatedCardNames:  string[];
  relatedCardHashes: (string | null)[];
  cardName:          string | null;
  images:            AnnouncementSide[];
}

export interface EntityUpdate {
  /** The parent card id when this update comes from a parent item; null for the entity's own update. */
  parentId:   string | null;
  parentName: string | null;
  images:     AnnouncementSide[];
}

export interface UpdateEntity {
  id:      string;
  type:    string;
  name:    string | null;
  status:  string | null;
  updates: EntityUpdate[];
}

/** Statuses that count as significant modifications when aggregating an entity. */
const SIGNIFICANT = new Set(['buff', 'nerf', 'rework', 'revert', 'tweak']);

/** Combines a set of statuses into one display status. */
export function combineStatus(statuses: (string | null)[]): string | null {
  const distinct = [...new Set(statuses.filter((v): v is string => !!v))];
  if (distinct.length === 0) return null;
  if (distinct.length === 1) return distinct[0] ?? null;

  const significant = distinct.filter(status => SIGNIFICANT.has(status));
  if (significant.length === 1) return significant[0] ?? null;
  if (significant.length >= 2) return significant.includes('rework') ? 'rework' : 'tweak';
  return 'tweak';
}

function relatedIndex(cards: string[], id: string): number {
  return cards.indexOf(id);
}

/**
 * Groups card-level announcement items into display entities. An item whose
 * `cardId` carries related cards is demoted to a parent and embedded under each
 * related card; an item without related cards becomes its own entity.
 */
export function transformUpdate(items: UpdateSourceItem[]): UpdateEntity[] {
  const entityIds: string[] = [];
  for (const item of items) {
    const refs = item.relatedCards.length > 0 ? item.relatedCards : (item.cardId ? [item.cardId] : []);
    for (const ref of refs) {
      if (ref && !entityIds.includes(ref)) entityIds.push(ref);
    }
  }

  return entityIds.map(id => {
    const contributing = items.filter(item => item.cardId === id || item.relatedCards.includes(id));
    const own = contributing.find(item => item.cardId === id);

    const name = own?.cardName
      ?? contributing.map(item => {
        const idx = relatedIndex(item.relatedCards, id);
        return idx !== -1 ? item.relatedCardNames[idx] ?? null : null;
      }).find(v => !!v) ?? null;

    const type = own?.type ?? contributing[0]?.type ?? 'card_update';
    const status = own ? own.status : combineStatus(contributing.map(item => item.status));

    const updates: EntityUpdate[] = [];
    if (own) {
      updates.push({ parentId: null, parentName: null, images: own.images });
    } else {
      const hash = contributing.map(item => {
        const idx = relatedIndex(item.relatedCards, id);
        return idx !== -1 ? item.relatedCardHashes[idx] ?? null : null;
      }).find(v => !!v) ?? null;
      const template = contributing.some(item => item.format === 'battlegrounds') ? 'battlegrounds' : 'normal';
      if (hash) updates.push({ parentId: null, parentName: null, images: [{ side: 'main', hash, category: 'base', template }] });
    }

    for (const item of contributing) {
      if (item.cardId === id) continue;
      updates.push({ parentId: item.cardId, parentName: item.cardName, images: item.images });
    }

    return { id, type, name, status, updates };
  });
}

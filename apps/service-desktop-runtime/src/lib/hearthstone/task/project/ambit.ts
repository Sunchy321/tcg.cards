import type { Ambit } from '@tcg-cards/model/ambit';

/**
 * Card ambit ladder (CONTEXT.md "card ambit", ADR 0015). Declaration order is
 * the ladder order: primary ⊂ additional ⊂ full. Ranks double as visibility
 * comparisons — the lower rank is the more restrictive ambit.
 */
const ambitRank: Record<Ambit, number> = { primary: 0, additional: 1, full: 2 };

/** Types players directly obtain and play when collectible. */
const primaryCardTypes: ReadonlySet<string> = new Set(['minion', 'spell', 'weapon', 'location']);

/** Battlegrounds standing components — primary despite never being collectible. */
const standingTypes: ReadonlySet<string> = new Set(['tavern_spell', 'quest_reward', 'trinket', 'anomaly']);

/** Per-card-decidable ambit from one revision's projected entity.
 *
 * Hero rule text lives in localizations, so the hero arm takes it as a
 * precomputed flag. Hero powers deliberately skip every arm here — their ambit
 * comes from the owning hero through the hero_power relation, which only
 * `deriveCardAmbits` sees. Enchantments are always full: they are attached
 * buffs, never searchable content.
 */
export function classifyCardAmbit(card: {
  type:            string;
  collectible:     boolean;
  inBobsTavern:    boolean;
  set:             string;
  mercenaryRole:   string | null;
  armor:           number | null;
  heroHasRuleText: boolean;
}): Ambit {
  if (standingTypes.has(card.type)) return 'primary';
  if (card.inBobsTavern) return 'primary';
  if (card.set === 'bgs' && card.type === 'hero') return 'primary';
  if (card.type === 'minion' && card.mercenaryRole != null) return 'primary';
  if (card.collectible && primaryCardTypes.has(card.type)) return 'primary';
  if (card.collectible && card.type === 'hero' && (card.armor != null || card.heroHasRuleText)) return 'primary';
  if (card.type === 'mercenary_ability') return 'additional';
  if (card.set === 'bgs' && card.type === 'spell') return 'additional';
  return 'full';
}

/** Minimal entity row shape the derivation needs. */
export interface AmbitEntityInput {
  cardId:          string;
  type:            string;
  collectible:     boolean;
  inBobsTavern:    boolean;
  set:             string;
  mercenaryRole:   string | null;
  armor:           number | null;
  heroHasRuleText: boolean;
}

/** Minimal relation row shape the derivation needs (live rows only). */
export interface AmbitRelationInput {
  relation: string;
  sourceId: string;
  targetId: string;
}

/** Card-level ambit derivation over projected rows — the pipeline-level step.
 *
 * Runs after relation projection: incoming relation edges and hero-power
 * ownership are invisible to the single-card projection. Produces one ambit
 * per card, version-independent: every revision of a card unifies onto the
 * most visible ambit any of its revisions classifies into ("ever" semantics —
 * a card that ever sat in Bob's Tavern stays primary across all revisions).
 * Relation evidence then upgrades otherwise-full cards to additional, and
 * hero powers resolve as min(owning hero, additional) with orphans falling
 * full.
 *
 * Pure over its inputs: the caller must pass classification inputs read from
 * entity content, never a previously derived ambit column, so repeated runs
 * are idempotent.
 */
export function deriveCardAmbits(
  entities:  readonly AmbitEntityInput[],
  relations: readonly AmbitRelationInput[],
): Map<string, Ambit> {
  // Cross-revision unification: the most visible per-revision classification wins.
  const perCard = new Map<string, Ambit>();
  const cardType = new Map<string, string>();
  for (const entity of entities) {
    cardType.set(entity.cardId, entity.type);
    const provisional = classifyCardAmbit(entity);
    const current = perCard.get(entity.cardId);
    if (current == null || ambitRank[provisional] < ambitRank[current]) {
      perCard.set(entity.cardId, provisional);
    }
  }

  // Golden forms (triple_card targets) never rise above full: they are
  // redundant copies of their base card, so no relation evidence upgrades
  // them. Other incoming edges are existence evidence; hero powers are
  // excluded too — their ambit comes from their owner instead.
  const goldenForms = new Set<string>();
  const hasEdge = new Set<string>();
  for (const rel of relations) {
    if (rel.relation === 'triple_card') {
      goldenForms.add(rel.targetId);
      continue;
    }
    hasEdge.add(rel.targetId);
  }

  const ambit = new Map<string, Ambit>();
  for (const [cardId, base] of perCard) {
    const value = base === 'full' && cardType.get(cardId) !== 'hero_power'
      && !goldenForms.has(cardId) && hasEdge.has(cardId)
      ? 'additional'
      : base;
    ambit.set(cardId, value);
  }

  // Hero power: min(owning hero, additional) over all owning heroes. A power
  // of a full hero (skin) stays full; a power with no hero_power relation
  // naming it has no existence evidence and falls full.
  const ownerRank = new Map<string, number>();
  for (const rel of relations) {
    if (rel.relation !== 'hero_power') continue;
    const owner = ambit.get(rel.sourceId);
    if (owner == null) continue;
    const rank = ambitRank[owner];
    const current = ownerRank.get(rel.targetId);
    if (current == null || rank < current) ownerRank.set(rel.targetId, rank);
  }
  for (const [cardId, type] of cardType) {
    if (type !== 'hero_power') continue;
    const rank = ownerRank.get(cardId);
    ambit.set(cardId, rank != null && rank < ambitRank.full ? 'additional' : 'full');
  }

  return ambit;
}

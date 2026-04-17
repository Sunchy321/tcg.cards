import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';

import { locale } from '#model/magic/schema/basic';
import { toolResultOf, evidenceBundle } from '#model/magic/schema/agent';
import { cardView } from '#model/magic/schema/card';
import { ruleItem } from '#model/magic/schema/rule';

import type { EvidenceItem } from '#model/magic/schema/agent';

import { db } from '#db/db';
import { Card, CardView } from '#schema/magic/card';
import { Ruling } from '#schema/magic/ruling';
import { CardRelation } from '#schema/magic/card-relation';
import { Rule, RuleItem } from '#schema/magic/rule';

import { search } from '~~/server/search';

// ---------------------------------------------------------------------------
// search_cards — wraps existing search DSL
// ---------------------------------------------------------------------------

const searchCardsOutput = z.strictObject({
  data: z.strictObject({
    result: z.array(z.strictObject({
      cardId: z.string(),
      name:   z.string(),
      cost:   z.string().nullable(),
    })),
    total: z.int(),
    page:  z.int(),
  }),
  evidence: evidenceBundle,
});

const searchCards = os
  .route({
    method:      'GET',
    description: 'Search cards by query DSL',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    q:        z.string().min(1).max(1000),
    page:     z.int().min(1).default(1),
    pageSize: z.int().min(1).max(20).default(10),
    locale:   locale.default('en'),
  }))
  .output(searchCardsOutput)
  .handler(async ({ input }) => {
    const { q, page, pageSize, locale } = input;

    const result = await search.search('search', q, {
      page,
      pageSize,
      lang:    locale,
      groupBy: 'card',
      orderBy: 'id+',
    });

    const cards = result.result?.result ?? [];

    const items: EvidenceItem[] = cards.map(r => ({
      sourceType: 'card' as const,
      sourceKey:  r.cardId,
      versionKey: null,
      locale,
      snippet:    r.cardLocalization.name,
      citation:   `card:${r.cardId}`,
      score:      1,
    }));

    return {
      data: {
        result: cards.map(r => ({
          cardId: r.cardId,
          name:   r.cardLocalization.name,
          cost:   r.cardPart.cost?.join('') ?? null,
        })),
        total: result.result?.total ?? 0,
        page:  result.result?.page ?? 1,
      },
      evidence: { items },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// get_card_summary — card facts from CardView
// ---------------------------------------------------------------------------

const getCardSummary = os
  .route({
    method:      'GET',
    description: 'Get card summary with evidence',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    cardId:    z.string(),
    locale:    locale.default('en'),
    partIndex: z.int().min(0).default(0),
  }))
  .output(toolResultOf(cardView))
  .handler(async ({ input }) => {
    const { cardId, locale, partIndex } = input;

    const view = await db.select()
      .from(CardView)
      .where(and(
        eq(CardView.cardId, cardId),
        eq(CardView.locale, locale),
        eq(CardView.partIndex, partIndex),
      ))
      .then(rows => rows[0]);

    if (view == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      data:     view,
      evidence: {
        items: [{
          sourceType: 'card' as const,
          sourceKey:  cardId,
          versionKey: null,
          locale,
          snippet:    `${view.localization.name} — ${view.localization.typeline}`,
          citation:   `card:${cardId}`,
          score:      1,
        }],
      },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// get_rulings — card rulings
// ---------------------------------------------------------------------------

const rulingEntry = z.strictObject({
  source:   z.string(),
  date:     z.string(),
  text:     z.string(),
  richText: z.string(),
});

const getRulings = os
  .route({
    method:      'GET',
    description: 'Get rulings for a card',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    cardId: z.string(),
  }))
  .output(toolResultOf(rulingEntry.array()))
  .handler(async ({ input }) => {
    const { cardId } = input;

    const rulings = await db.select({
      source:   Ruling.source,
      date:     Ruling.date,
      text:     Ruling.text,
      richText: Ruling.richText,
    })
      .from(Ruling)
      .where(eq(Ruling.cardId, cardId))
      .orderBy(desc(Ruling.date));

    const items: EvidenceItem[] = rulings.map(r => ({
      sourceType: 'ruling' as const,
      sourceKey:  `${cardId}/${r.date}`,
      versionKey: r.date,
      locale:     'en',
      snippet:    r.text.slice(0, 200),
      citation:   `ruling:${cardId}:${r.date}`,
      score:      1,
    }));

    return {
      data:     rulings,
      evidence: { items },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// get_rule_sections — retrieve rule items by serial/keyword
// ---------------------------------------------------------------------------

const getRuleSections = os
  .route({
    method:      'GET',
    description: 'Get rule sections by serial prefix or index range',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    date: z.iso.date().optional(),
    lang: z.string().default('en'),
    from: z.int().min(0),
    to:   z.int().min(0),
  }))
  .output(toolResultOf(ruleItem.array()))
  .handler(async ({ input }) => {
    const { lang, from, to } = input;

    // Use the latest rule if no date is given
    let date = input.date;

    if (date == null) {
      const latest = await db.select({ date: Rule.date })
        .from(Rule)
        .orderBy(desc(Rule.date))
        .limit(1)
        .then(rows => rows[0]);

      if (latest == null) {
        throw new ORPCError('NOT_FOUND');
      }

      date = latest.date;
    }

    const rule = await db.select()
      .from(Rule)
      .where(and(
        eq(Rule.date, date),
        or(eq(Rule.lang, 'en'), eq(Rule.lang, lang)),
      ))
      .then(rows => rows[0]);

    if (rule == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select({
      itemId:   RuleItem.itemId,
      index:    RuleItem.index,
      depth:    RuleItem.depth,
      serial:   RuleItem.serial,
      text:     RuleItem.text,
      richText: RuleItem.richText,
    }).from(RuleItem)
      .where(and(
        eq(RuleItem.date, rule.date),
        eq(RuleItem.lang, rule.lang),
        gte(RuleItem.index, from),
        lte(RuleItem.index, to),
      ))
      .orderBy(RuleItem.index);

    const evidence: EvidenceItem[] = items.map(item => ({
      sourceType: 'document_node' as const,
      sourceKey:  item.itemId,
      versionKey: date!,
      locale:     lang,
      snippet:    `${item.serial ?? ''} ${item.text}`.trim().slice(0, 200),
      citation:   `rule:${date}:${item.itemId}`,
      score:      1,
    }));

    return {
      data:     items,
      evidence: { items: evidence },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// get_rule_by_serial — look up rules by serial number prefix
// ---------------------------------------------------------------------------

const ruleEntry = z.strictObject({
  serial: z.string().nullable(),
  text:   z.string(),
});

const getRuleBySerial = os
  .route({
    method:      'GET',
    description: 'Look up rules by serial number prefix',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    ruleNumber: z.string(),
    lang:       z.string().default('en'),
  }))
  .output(toolResultOf(ruleEntry.array()))
  .handler(async ({ input }) => {
    const { ruleNumber, lang } = input;

    const latestRule = await db.select()
      .from(Rule)
      .where(eq(Rule.lang, lang))
      .orderBy(desc(Rule.date))
      .limit(1)
      .then(rows => rows[0]);

    if (latestRule == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select({
      itemId: RuleItem.itemId,
      serial: RuleItem.serial,
      text:   RuleItem.text,
    }).from(RuleItem)
      .where(and(
        eq(RuleItem.date, latestRule.date),
        eq(RuleItem.lang, lang),
        sql`${RuleItem.serial} LIKE ${ruleNumber + '%'}`,
      ))
      .orderBy(RuleItem.index)
      .limit(30);

    const evidence: EvidenceItem[] = items.map(item => ({
      sourceType: 'document_node' as const,
      sourceKey:  item.itemId,
      versionKey: latestRule.date,
      locale:     lang,
      snippet:    `${item.serial ?? ''} ${item.text}`.trim().slice(0, 200),
      citation:   `rule:${latestRule.date}:${item.itemId}`,
      score:      1,
    }));

    return {
      data:     items.map(item => ({ serial: item.serial, text: item.text })),
      evidence: { items: evidence },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// get_related_cards — card relations
// ---------------------------------------------------------------------------

const relatedCardEntry = z.strictObject({
  relation: z.string(),
  cardId:   z.string(),
});

const getRelatedCards = os
  .route({
    method:      'GET',
    description: 'Get related cards',
    tags:        ['Magic', 'Agent'],
  })
  .input(z.object({
    cardId: z.string(),
  }))
  .output(toolResultOf(relatedCardEntry.array()))
  .handler(async ({ input }) => {
    const { cardId } = input;

    const sourceRelation = await db.select({
      relation: CardRelation.relation,
      cardId:   CardRelation.targetId,
    })
      .from(CardRelation)
      .innerJoin(Card, eq(CardRelation.targetId, Card.cardId))
      .where(eq(CardRelation.sourceId, cardId));

    const targetRelation = await db.select({
      relation: CardRelation.relation,
      cardId:   CardRelation.sourceId,
    })
      .from(CardRelation)
      .innerJoin(Card, eq(CardRelation.sourceId, Card.cardId))
      .where(eq(CardRelation.targetId, cardId));

    const relations = [...sourceRelation, ...targetRelation];

    const evidence: EvidenceItem[] = relations.map(r => ({
      sourceType: 'card_relation' as const,
      sourceKey:  `${cardId}→${r.cardId}`,
      versionKey: null,
      locale:     'en',
      snippet:    `${r.relation}: ${r.cardId}`,
      citation:   `relation:${cardId}:${r.cardId}`,
      score:      1,
    }));

    return {
      data:     relations,
      evidence: { items: evidence },
    };
  })
  .callable();

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const agentTrpc = {
  searchCards,
  getCardSummary,
  getRulings,
  getRuleSections,
  getRuleBySerial,
  getRelatedCards,
};

export const agentApi = {
  searchCards,
  getCardSummary,
  getRulings,
  getRuleSections,
  getRuleBySerial,
  getRelatedCards,
};

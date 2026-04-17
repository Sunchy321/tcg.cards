import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { CardView } from '#schema/magic/card';
import { Ruling } from '#schema/magic/ruling';
import { Rule, RuleItem } from '#schema/magic/rule';
import { search } from '~~/server/search';

const SYSTEM_PROMPT = `You are a Magic: The Gathering knowledge assistant. You help users with questions about cards, rules, and game mechanics.

IMPORTANT:
- Always use the provided tools to look up information. Do not rely on your training data for specific card details, rules text, or rulings.
- When a user asks about a card, first search for it, then get its details if needed.
- When citing rules, reference the rule number.
- If tools don't return sufficient information, say so honestly.

Search syntax for the searchCards tool:
- Simple text searches card names: "Lightning Bolt"
- name: for explicit name search: "name:Lightning"
- type: or t: for type search: "t:creature"
- text: or x: for rules text search: "x:flying"
- color: or c: for color (W=White, U=Blue, B=Black, R=Red, G=Green): "c:R"
- set: or s: for set code: "s:MH3"
- format: or f: for format legality: "f:standard"
- manaValue: or mv: for mana value: "mv:3"
- Combine with spaces: "name:Bolt c:R"
`;

export default defineEventHandler(async event => {
  const { messages } = await readBody(event);

  const kimi = createOpenAICompatible({
    name:    'kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey:  process.env.MOONSHOT_API_KEY,
  });

  return streamText({
    model:    kimi.chatModel('kimi-k2.5'),
    system:   SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools:    {
      searchCards: tool({
        description: 'Search for Magic: The Gathering cards. Returns a list of matching cards with basic info. Use the search syntax from the system prompt.',
        inputSchema: z.object({
          query: z.string().describe('Search query using the search syntax'),
        }),
        execute: async ({ query }) => {
          const result = await search.search('search', query, {
            page:     1,
            pageSize: 10,
            lang:     'en',
            groupBy:  'card' as const,
            orderBy:  'name+',
          });

          if (result.result == null) {
            return { cards: [], total: 0 };
          }

          return {
            cards: result.result.result.map(row => ({
              cardId:   row.cardId,
              name:     row.cardLocalization?.name ?? row.cardPart.name,
              typeline: row.cardLocalization?.typeline ?? row.cardPart.typeline,
              cost:     row.cardPart.cost,
              text:     row.cardLocalization?.text ?? row.cardPart.text,
            })),
            total: result.result.total,
          };
        },
      }),

      getCard: tool({
        description: 'Get detailed information about a specific Magic card by its cardId. Includes rules text, type, stats, rulings, and legalities.',
        inputSchema: z.object({
          cardId: z.string().describe('The card ID (e.g. "lightning_bolt")'),
          locale: z.string().default('en').describe('Locale for card text'),
        }),
        execute: async ({ cardId, locale }) => {
          const views = await db.select()
            .from(CardView)
            .where(and(
              eq(CardView.cardId, cardId),
              sql`${CardView.locale} = ${locale}`,
            ))
            .limit(10);

          if (views.length === 0) {
            return { error: 'Card not found' };
          }

          const rulings = await db.select({
            source: Ruling.source,
            date:   Ruling.date,
            text:   Ruling.text,
          }).from(Ruling).where(eq(Ruling.cardId, cardId));

          const parts = views.map(view => ({
            partIndex: view.partIndex,
            name:      view.localization?.name ?? view.part.name,
            typeline:  view.localization?.typeline ?? view.part.typeline,
            text:      view.localization?.text ?? view.part.text,
            cost:      view.part.cost,
            manaValue: view.part.manaValue,
            color:     view.part.color,
            power:     view.part.power,
            toughness: view.part.toughness,
            loyalty:   view.part.loyalty,
            defense:   view.part.defense,
          }));

          const card = views[0]!;

          return {
            cardId,
            name:          card.card.name,
            colorIdentity: card.card.colorIdentity,
            keywords:      card.card.keywords,
            legalities:    card.card.legalities,
            parts,
            rulings:       rulings.map(r => ({
              source: r.source,
              date:   r.date,
              text:   r.text,
            })),
          };
        },
      }),

      getRuleSection: tool({
        description: 'Look up a specific rule section from the Magic: The Gathering Comprehensive Rules. Provide a rule number like "702.1" or "100" to get matching rules.',
        inputSchema: z.object({
          ruleNumber: z.string().describe('Rule number to look up (e.g. "702.1", "100", "702.1a")'),
        }),
        execute: async ({ ruleNumber }) => {
          // Find the latest rule date
          const latestRule = await db.select()
            .from(Rule)
            .where(eq(Rule.lang, 'en'))
            .orderBy(desc(Rule.date))
            .limit(1)
            .then(rows => rows[0]);

          if (latestRule == null) {
            return { error: 'No rules found' };
          }

          // Query rule items matching the serial number
          const items = await db.select({
            serial: RuleItem.serial,
            text:   RuleItem.text,
            depth:  RuleItem.depth,
          }).from(RuleItem)
            .where(and(
              eq(RuleItem.date, latestRule.date),
              eq(RuleItem.lang, 'en'),
              sql`${RuleItem.serial} LIKE ${ruleNumber + '%'}`,
            ))
            .orderBy(RuleItem.index)
            .limit(30);

          if (items.length === 0) {
            return { error: `No rules found matching "${ruleNumber}"` };
          }

          return {
            date:  latestRule.date,
            rules: items.map(item => ({
              serial: item.serial,
              text:   item.text,
            })),
          };
        },
      }),
    },
  }).toUIMessageStreamResponse();
});

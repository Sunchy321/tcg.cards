import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';

import { mainLocale } from '#model/magic/schema/basic';
import { agentTrpc } from '~~/server/orpc/magic/agent';

const SYSTEM_PROMPT = `You are a Magic: The Gathering knowledge assistant. You help users with questions about cards, rules, and game mechanics.

IMPORTANT:
- Always use the provided tools to look up information. Do not rely on your training data for specific card details, rules text, or rulings.
- When a user asks about a card, first search for it, then get its details if needed.
- Card translations must come from tool results. Never translate card names, typelines, oracle text, or rulings yourself.
- When the user asks in a supported language or explicitly asks for translated card text, call tools with the matching locale and quote the localized fields returned by the tools.
- Use these locale values when needed: en, zhs, zht, de, fr, it, ja, ko, pt, ru, es.
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
- Values containing spaces must be quoted: name:"Lightning Bolt", t:"Legendary Creature"
- Literal quotes inside a quoted value must be escaped with backslash: name:"Kongming, \\"Sleeping Dragon\\""
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
        description: 'Search for Magic: The Gathering cards. Returns card names in the requested locale. Use the search syntax from the system prompt, and when the user asks for translated card names use the matching locale instead of translating yourself.',
        inputSchema: z.object({
          query:  z.string().describe('Search query using the search syntax'),
          locale: mainLocale.default('en').describe('Locale for returned card names. Use the user requested language when they ask for translated card names.'),
        }),
        execute: async ({ query, locale }) => {
          const result = await agentTrpc.searchCards({ q: query, page: 1, pageSize: 10, locale }, { context: {} as any });
          return { cards: result.data.result, total: result.data.total };
        },
      }),

      getCard: tool({
        description: 'Get detailed information about a specific Magic card by its cardId. Returns localized card name, typeline, and rules text for the requested locale. Use the matching locale for translations instead of translating card text yourself.',
        inputSchema: z.object({
          cardId: z.string().describe('The card ID (e.g. "lightning_bolt")'),
          locale: mainLocale.default('en').describe('Locale for localized card name and text'),
        }),
        execute: async ({ cardId, locale }) => {
          const result = await agentTrpc.getCardSummary({ cardId, locale, partIndex: 0 }, { context: {} as any });
          const view = result.data;

          const rulingsResult = await agentTrpc.getRulings({ cardId }, { context: {} as any });

          return {
            cardId,
            name:          view.localization.name,
            englishName:   view.card.name,
            typeline:      view.localization.typeline,
            text:          view.localization.text,
            cost:          view.part.cost,
            manaValue:     view.part.manaValue,
            color:         view.part.color,
            colorIdentity: view.card.colorIdentity,
            power:         view.part.power,
            toughness:     view.part.toughness,
            loyalty:       view.part.loyalty,
            defense:       view.part.defense,
            keywords:      view.card.keywords,
            legalities:    view.card.legalities,
            rulings:       rulingsResult.data.map(r => ({ source: r.source, date: r.date, text: r.text })),
          };
        },
      }),

      getRuleSection: tool({
        description: 'Look up a specific rule section from the Magic: The Gathering Comprehensive Rules. Provide a rule number like "702.1" or "100" to get matching rules.',
        inputSchema: z.object({
          ruleNumber: z.string().describe('Rule number to look up (e.g. "702.1", "100", "702.1a")'),
        }),
        execute: async ({ ruleNumber }) => {
          const result = await agentTrpc.getRuleBySerial({ ruleNumber }, { context: {} as any });

          if (result.data.length === 0) {
            return { error: `No rules found matching "${ruleNumber}"` };
          }

          return { rules: result.data };
        },
      }),

      getRelatedCards: tool({
        description: 'Get cards related to a given card (e.g. tokens it creates, combo pieces, meld components).',
        inputSchema: z.object({
          cardId: z.string().describe('The card ID to find relations for'),
        }),
        execute: async ({ cardId }) => {
          const result = await agentTrpc.getRelatedCards({ cardId }, { context: {} as any });
          return { relations: result.data };
        },
      }),
    },
  }).toUIMessageStreamResponse();
});

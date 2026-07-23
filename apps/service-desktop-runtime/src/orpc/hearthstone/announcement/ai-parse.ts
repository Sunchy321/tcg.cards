import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { generateText, isStepCount, tool } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { and, eq, ilike, sql } from 'drizzle-orm';

import { Patch } from '@tcg-cards/db/schema/local/hearthstone';
import { LatestEntity, LatestEntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone';
import { locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
import { glowEntry, group as groupEnum } from '@tcg-cards/model/src/hearthstone/schema/announcement';
import { renderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { extractJsonObject, matchPatches, normalizeAiResult } from '../../../lib/hearthstone/announcement/ai';
import { hasAiConfig, readAiConfig } from '../../../runtime-config';

const itemDelta = z.object({
  prev: renderModel.partial().optional(),
  curr: renderModel.partial().optional(),
}).nullable();

const item = z.object({
  type:         z.string(),
  format:       z.string().nullable(),
  status:       z.string().nullable(),
  cardId:       z.string().nullable(),
  setId:        z.string().nullable(),
  ruleId:       z.string().nullable(),
  delta:        itemDelta,
  glow:         glowEntry.array().nullable(),
  relatedCards: z.string().array(),
  group:        z.string().nullable(),
  score:        z.number().nullable(),
});

const header = z.object({
  name:          z.string().nullable(),
  date:          z.string().nullable(),
  effectiveDate: z.string().nullable(),
  version:       z.number().nullable(),
});

export const aiParse = os
  .route({
    method:      'POST',
    description: 'Parse announcement text with AI to extract header fields and items',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    name:  z.string().optional(),
    links: z.array(z.object({ url: z.string(), label: z.string().optional() })),
  }))
  .output(z.object({ header, items: item.array() }))
  .handler(async ({ input }) => {
    if (!hasAiConfig()) {
      throw new ORPCError('PRECONDITION_FAILED', { message: 'AI config not set. Please configure API key in settings.' });
    }

    const config = readAiConfig();

    const provider = createOpenAICompatible({
      name:    'announcement-ai',
      baseURL: config.baseUrl ?? 'https://api.openai.com/v1',
      apiKey:  config.apiKey!,
    });

    const model = provider(config.model || 'gpt-4o-mini');

    const linkTexts = await fetchLinkContents(input.links.map(l => l.url));
    const prompt = buildPrompt(input.name, input.links, linkTexts);

    const db = getLocalDb();

    const lookupPatches = tool({
      description: 'Look up Hearthstone patches matching a version string (e.g. "34.0.3"). Returns candidate patches with buildNumber, newest first. Pick the matching buildNumber for header.version.',
      inputSchema: z.object({ version: z.string() }),
      execute:     async ({ version }) => {
        try {
          const rows = await db.select({
            buildNumber: Patch.buildNumber,
            name:        Patch.name,
            shortName:   Patch.shortName,
            releaseDate: Patch.releaseDate,
          }).from(Patch);

          return matchPatches(rows, version);
        } catch {
          return [];
        }
      },
    });

    const searchCards = tool({
      description: 'Search Hearthstone cards by localized card names. Accepts MULTIPLE names in one call — pass every card name from the announcement at once. Returns cardId candidates per name.',
      inputSchema: z.object({ names: z.string().array().min(1), lang: locale.default('en') }),
      execute:     async ({ names, lang }) => {
        return Promise.all(names.slice(0, 30).map(async name => ({
          name,
          candidates: await searchCardCandidates(db, name, lang),
        })));
      },
    });

    let result = await generateTextSafe({
      model,
      instructions: SYSTEM_PROMPT,
      prompt,
      tools:        { lookupPatches, searchCards },
      stopWhen:     isStepCount(12),
      temperature:  0.1,
    });

    // Step budget exhausted while still calling tools: force a final answer without tools.
    if (result.text.trim() === '' && result.finishReason === 'tool-calls') {
      result = await generateTextSafe({
        model,
        instructions: SYSTEM_PROMPT,
        messages:     [{ role: 'user', content: prompt }, ...result.responseMessages],
        tools:        { lookupPatches, searchCards },
        toolChoice:   'none',
        temperature:  0.1,
      });
    }

    const { text, finishReason } = result;
    const stepCount = result.steps.length;

    try {
      return normalizeAiResult(extractJsonObject(text));
    } catch (error) {
      console.error('[announcement ai-parse] unparsable AI output', { finishReason, stepCount, text });

      const detail = error instanceof Error ? error.message : String(error);
      const snippet = text.trim() === '' ? '(empty output)' : text.slice(0, 300);

      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `AI returned unparsable response: ${detail} (finishReason=${finishReason}, steps=${stepCount}). Output: ${snippet}`,
      });
    }
  });

async function generateTextSafe(options: Parameters<typeof generateText>[0]) {
  try {
    return await generateText(options);
  } catch (error) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: `AI API error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

type Lang = z.infer<typeof locale>;

async function searchCardCandidates(db: ReturnType<typeof getLocalDb>, name: string, lang: Lang) {
  try {
    return await db.select({
      cardId:      LatestEntityLocalization.cardId,
      name:        LatestEntityLocalization.name,
      set:         LatestEntity.set,
      type:        LatestEntity.type,
      cost:        LatestEntity.cost,
      attack:      LatestEntity.attack,
      health:      LatestEntity.health,
      collectible: LatestEntity.collectible,
    })
      .from(LatestEntity)
      .innerJoin(LatestEntityLocalization, and(
        eq(LatestEntity.cardId, LatestEntityLocalization.cardId),
        eq(LatestEntity.revisionHash, LatestEntityLocalization.revisionHash),
        sql`${LatestEntity.version} && ${LatestEntityLocalization.version}`,
      ))
      .where(and(
        eq(LatestEntityLocalization.lang, lang),
        ilike(LatestEntityLocalization.name, `%${name}%`),
      ))
      .limit(10);
  } catch {
    return [];
  }
}

/** Fetch contents of given URLs (in parallel, with timeout). */
async function fetchLinkContents(urls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.map(async url => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(url, { signal: controller.signal });
        const text = await res.text();

        return stripHtml(text).slice(0, 16000);
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  return results.map(r => r.status === 'fulfilled' ? r.value : '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildPrompt(
  name: string | undefined,
  links: Array<{ url: string, label?: string }>,
  contents: string[],
): string {
  const parts: string[] = [];

  if (name != null && name !== '') {
    parts.push(`Announcement title: ${name}`);
  }

  for (let i = 0; i < links.length; i++) {
    parts.push(`--- Source [${links[i]!.label || links[i]!.url}] ---`);
    parts.push(contents[i] || '(could not fetch)');
  }

  return parts.join('\n\n');
}

const SYSTEM_PROMPT = `You are a parser for Hearthstone game balance announcements. Extract structured data from the announcement text.

You have two tools:
- lookupPatches({ version }): look up patches by version string (e.g. "34.0.3"). Call it once you identify the patch version mentioned in the announcement, then pick the matching buildNumber for header.version.
- searchCards({ names, lang }): search cards by localized names (lang defaults to "en"; use "zhs" for Chinese sources). Pass ALL card names in ONE call. Use the results to resolve exact cardIds. Prefer collectible candidates whose type/cost match the announcement context.

Be efficient with tools: first read the announcement and collect the patch version and every changed card name, then make ONE lookupPatches call and ONE searchCards call (a second searchCards call is acceptable only for names you missed). After that, output the final JSON.

After using tools as needed, output ONLY a valid JSON object (no markdown, no explanation) with this shape:

{
  "header": {
    "name": announcement title string, or null if unknown,
    "date": publish date in "YYYY-MM-DD", or null,
    "effectiveDate": the date the changes take effect in "YYYY-MM-DD", or null,
    "version": the patch buildNumber chosen from lookupPatches results, or null
  },
  "items": [ ... ]
}

Each item has these fields:
- type: one of "card_change" (legality change: ban/unban/rotation), "card_update" (stat/text change: buff/nerf/rework), "set_change" (set-level event: mini-set release), "rule_change" (rule/mechanic change), "format_birth", "format_death"
- format: format keyword, or null for all formats. Examples: "standard", "wild", "constructed", "battlegrounds", null
- status: one of "buff", "nerf", "tweak", "revert", "rework", "text_fix", "text_adjust", "bugged", "bugfix", "banned", "banned_in_card_pool", "banned_in_deck", "legal", "unavailable", "minor", "score", "extend", or null
- cardId: ONLY for card_change / card_update: the changed card's ID. Must be null for all other types.
- setId: ONLY for set_change: the set ID. Must be null for all other types.
- ruleId: ONLY for rule_change: rule identifier (free text, optionally prefixed like "set:core"). Must be null for all other types.
- delta: null, or { "prev": { ...old render model field values }, "curr": { ...new render model field values } }. Each side is a partial RenderModel. Put old values stated by the announcement in prev and new values in curr. Include only fields explicitly supported by the source.
- glow: null, or array of { part: string, type: "buff" | "nerf" | "rework" | "neutral" } identifying each changed card part. Use "buff" when the part became stronger, "nerf" when it became weaker, "rework" for a functional redesign that is not meaningfully directional, and "neutral" for a presentation or wording change that does not affect gameplay. Do not invent glow entries when the nature of the change is ambiguous.
- relatedCards: ONLY for card_change / card_update: related card IDs affected by this change (e.g. the collectible card that summons a changed token). Must be an empty array for all other types.
- group: ONLY for card_change items that are part of a bulk rotation. Allowed values: ${groupEnum.options.map(v => `"${v}"`).join(', ')}. Use null for all other items, including non-rotation changes. Never invent other group values.
- score: null, or integer score value

Important:
- Entity references are mutually exclusive by type: card_change/card_update use cardId (+ relatedCards), set_change uses setId, rule_change uses ruleId, format_birth/format_death use none of them. Never fill an id field that does not match the item type.
- If the announcement mentions multiple cards changed, create one item per card.
- If a card is both nerfed and banned, create two separate items.
- For mini-set releases (35 new cards), create one set_change item with type "set_change" and status "extend".
- Use searchCards to resolve cardIds instead of guessing; if no candidate matches, use null.
- Use lookupPatches to resolve header.version; if no candidate matches, use null.
- For card_update items, preserve both old and new values when the source states both. Use null for delta or glow when the source does not provide enough information to determine them reliably.
- Only include fields that are actually present; use null for absent fields.
- The final answer must be ONLY valid JSON, no markdown, no explanation.`;

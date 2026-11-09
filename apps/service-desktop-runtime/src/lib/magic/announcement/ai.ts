import { z } from 'zod';
import { slugifyName } from '@tcg-cards/shared/magic/slug';
import { aiAnnouncementHeader, aiAnnouncementResult, type AiAnnouncementResult } from '@tcg-cards/model/magic/schema/announcement-ai';
import { formats } from '@tcg-cards/model/magic/schema/basic';

const cardName = z.string().trim().min(1).refine(name => {
  const letters = name.match(/\p{Letter}/gu) ?? [];
  return letters.every(letter => /\p{Script=Latin}/u.test(letter)) && slugifyName(name) !== '';
}, 'An English card name is required');

/** Converts model-supplied English names into the same identifiers used by card import. */
export function normalizeAiResult(value: unknown): AiAnnouncementResult {
  const parsed = z.object({
    header: aiAnnouncementHeader,
    items:  z.array(z.object({
      type:          z.string(),
      status:        z.string().nullish(),
      effectiveDate: z.string().nullish(),
      format:        z.enum(formats).nullish(),
      cardName:      cardName.nullish(),
      relatedNames:  z.array(cardName).default([]),
      setId:         z.string().nullish(),
      ruleId:        z.string().nullish(),
      score:         z.number().nullish(),
    })),
  }).parse(value);

  return aiAnnouncementResult.parse({
    header: parsed.header,
    items:  parsed.items.map(({ cardName: name, relatedNames, ...item }) => ({
      ...item,
      cardId:       name == null ? null : slugifyName(name),
      relatedCards: relatedNames.map(slugifyName),
    })),
  });
}

/** Reads a JSON object from plain or fenced model output without accepting partial results. */
export function parseAiResult(text: string): AiAnnouncementResult {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return normalizeAiResult(JSON.parse(fenced?.[1] ?? text.trim()));
}

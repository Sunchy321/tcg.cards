import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { hasAiConfig, readAiConfig } from '../../../runtime-config';

const item = z.object({
  type:   z.string(),
  name:   z.string(),
  format: z.string().nullable(),
  status: z.string().nullable(),
  cardId: z.string().nullable(),
  setId:  z.string().nullable(),
  ruleId: z.string().nullable(),
  delta:        z.any().nullable(),
  glow:         z.any().nullable(),
  relatedCards: z.string().array(),
  group:        z.string().nullable(),
  score:        z.number().nullable(),
});

export const aiParse = os
  .route({
    method:      'POST',
    description: 'Parse announcement text with AI to extract items',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    name:   z.string(),
    links:  z.array(z.object({ url: z.string(), label: z.string().optional() })),
  }))
  .output(z.object({ items: item.array() }))
  .handler(async ({ input }) => {
    if (!hasAiConfig()) {
      throw new ORPCError('PRECONDITION_FAILED', { message: 'AI config not set. Please configure API key in settings.' });
    }

    const config = readAiConfig();
    const apiKey = config.apiKey!;
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const model = config.model || 'gpt-4o-mini';

    const linkTexts = await fetchLinkContents(input.links.map(l => l.url));

    const prompt = buildPrompt(input.name, input.links, linkTexts);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: `AI API error (${response.status}): ${errorText}` });
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'AI returned empty response' });
    }

    const parsed = JSON.parse(content);
    const rawItems = parsed.items ?? [];

    return {
      items: rawItems.map((i: any) => ({
        type:    i.type ?? 'card_update',
        name:    i.name ?? '',
        format:  i.format ?? null,
        status:  i.status ?? null,
        cardId:  i.cardId ?? null,
        setId:   i.setId ?? null,
        ruleId:  i.ruleId ?? null,
        delta:        i.delta ?? null,
        glow:         i.glow ?? null,
        relatedCards: Array.isArray(i.relatedCards) ? i.relatedCards : [],
        group:        i.group ?? null,
        score:        i.score ?? null,
      })),
    };
  });

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
  name: string,
  links: Array<{ url: string; label?: string }>,
  contents: string[],
): string {
  const parts = [`Announcement title: ${name}`];
  for (let i = 0; i < links.length; i++) {
    parts.push(`--- Source [${links[i]!.label || links[i]!.url}] ---`);
    parts.push(contents[i] || '(could not fetch)');
  }
  return parts.join('\n\n');
}

const SYSTEM_PROMPT = `You are a parser for Hearthstone game balance announcements. Extract structured change items from the announcement text.

Output a JSON object with an "items" array. Each item has these fields:
- type: one of "card_change" (legality change: ban/unban/rotation), "card_update" (stat/text change: buff/nerf/rework), "set_change" (set-level event: mini-set release), "rule_change" (rule/mechanic change), "format_birth", "format_death"
- name: brief description of the change
- format: format keyword, or null for all formats. Examples: "standard", "wild", "constructed", "battlegrounds", null
- status: one of "buff", "nerf", "tweak", "revert", "rework", "text_fix", "text_adjust", "bugged", "bugfix", "banned", "banned_in_card_pool", "banned_in_deck", "legal", "unavailable", "minor", "score", "extend", or null
- cardId: card ID if identifiable, or null
- setId: set ID if applicable, or null
- ruleId: rule identifier if applicable, or null
- delta: null, or object with changed render model fields (attack, health, cost, etc.) with new values
- glow: null, or array of { part: string, type: "buff" | "nerf" } for card glow effects
- relatedCards: array of related card IDs affected by this change
- group: null, or a grouping key for display purposes
- score: null, or integer score value

Important:
- If the announcement mentions multiple cards changed, create one item per card.
- If a card is both nerfed and banned, create two separate items.
- For mini-set releases (35 new cards), create one set_change item with type "set_change" and status "extend".
- Be precise with cardIds when they can be identified from card names.
- Only include fields that are actually present; use null for absent fields.
- Return ONLY valid JSON, no markdown, no explanation.`;

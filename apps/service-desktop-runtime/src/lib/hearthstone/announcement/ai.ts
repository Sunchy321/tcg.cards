import { group as groupEnum } from '@tcg-cards/model/src/hearthstone/schema/announcement';

export interface AiHeader {
  name:          string | null;
  date:          string | null;
  effectiveDate: string | null;
  version:       number | null;
}

export interface AiItem {
  type:         string;
  format:       string | null;
  status:       string | null;
  cardId:       string | null;
  setId:        string | null;
  ruleId:       string | null;
  delta:        unknown;
  glow:         unknown;
  relatedCards: string[];
  group:        string | null;
  score:        number | null;
}

export interface AiParseResult {
  header: AiHeader;
  items:  AiItem[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('No JSON object found in AI output');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export function normalizeAiResult(parsed: any): AiParseResult {
  const header = parsed?.header ?? {};
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  return {
    header: {
      name:          typeof header.name === 'string' && header.name !== '' ? header.name : null,
      date:          typeof header.date === 'string' && DATE_PATTERN.test(header.date) ? header.date : null,
      effectiveDate: typeof header.effectiveDate === 'string' && DATE_PATTERN.test(header.effectiveDate) ? header.effectiveDate : null,
      version:       typeof header.version === 'number' && Number.isInteger(header.version) ? header.version : null,
    },
    items: rawItems.map((i: any) => ({
      type:         i.type ?? 'card_update',
      format:       i.format ?? null,
      status:       i.status ?? null,
      cardId:       i.cardId ?? null,
      setId:        i.setId ?? null,
      ruleId:       i.ruleId ?? null,
      delta:        i.delta ?? null,
      glow:         i.glow ?? null,
      relatedCards: Array.isArray(i.relatedCards) ? i.relatedCards : [],
      group:        groupEnum.safeParse(i.group).success ? i.group : null,
      score:        i.score ?? null,
    })),
  };
}

export interface PatchRow {
  buildNumber: number;
  name:        string;
  shortName:   string;
  releaseDate: string | null;
}

export function matchPatches(patches: PatchRow[], version: string): PatchRow[] {
  const query = version.trim();

  if (query === '') {
    return [];
  }

  return patches
    .filter(p => p.shortName.startsWith(query) || p.name.includes(query))
    .sort((a, b) => b.buildNumber - a.buildNumber)
    .slice(0, 10);
}

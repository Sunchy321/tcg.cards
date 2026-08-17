#!/usr/bin/env bun

/**
 * Fetch the full Yu-Gi-Oh! card pack list from the 百鸽 (ygocdb.com) /packs page
 * and write a trimmed static JSON snapshot for the site-yugioh pack pages.
 *
 * The page is server-rendered and contains two tabs: #ocg (Japanese names) and
 * #tcg (English names). Each pack is a <li class="pack"> holding date, code and
 * card count spans plus a name link that carries the stable numeric pack id.
 *
 * The snapshot is checked into the repository so the pack list does not depend
 * on a runtime API. Re-run this script to refresh the list when the upstream
 * source changes.
 *
 * Usage: bun scripts/generate-yugioh-sets.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PACKS_URL = 'https://ygocdb.com/packs';
const OUTPUT_PATH = join(import.meta.dir, '../apps/site-yugioh/app/data/yugioh-sets.json');

/** One trimmed pack record stored in the static snapshot. */
interface YugiohSet {
  id: string;
  code: string | null;
  name: string;
  region: 'ocg' | 'tcg';
  cardCount: number;
  releasedAt: string | null;
}

/** Decodes the HTML entities that appear in pack names. */
function decodeEntities(input: string) {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Parses one tab panel (ocg or tcg) of the /packs page into pack records. */
function parsePanel(html: string, region: 'ocg' | 'tcg') {
  const panelStart = html.indexOf(`id="${region}"`);
  if (panelStart < 0) {
    throw new Error(`Missing "${region}" tab panel in packs page.`);
  }

  const panelEnd = html.indexOf('</div>', panelStart);
  if (panelEnd < 0) {
    throw new Error(`Unterminated "${region}" tab panel in packs page.`);
  }

  const panel = html.slice(panelStart, panelEnd);
  const items = [...panel.matchAll(/<li class="pack">([\s\S]*?)<\/li>/g)];

  if (items.length === 0) {
    throw new Error(`No <li class="pack"> items found in "${region}" panel.`);
  }

  return items.map((match) => {
    const body = match[1];
    const spans = [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((span) => span[1]);
    const link = body.match(/<a href="\/pack\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);

    if (!link) {
      throw new Error(`A "${region}" pack item is missing its pack link.`);
    }

    if (spans.length < 3) {
      throw new Error(`A "${region}" pack item is missing date/code/count spans.`);
    }

    const date = spans[0].trim();
    const code = spans[1].trim();
    const rawCount = spans[2].trim();
    const id = link[1];
    const name = decodeEntities(link[2]).trim();

    if (name.length === 0) {
      throw new Error(`A "${region}" pack item has an empty name.`);
    }

    if (!Number.isInteger(Number(rawCount)) || Number(rawCount) < 0) {
      throw new Error(`Pack "${name}" has an invalid card count "${rawCount}".`);
    }

    return {
      id,
      code: code.length > 0 ? code : null,
      name,
      region,
      cardCount: Number(rawCount),
      releasedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    };
  });
}

async function main() {
  const response = await fetch(PACKS_URL, {
    headers: {
      accept: 'text/html',
      'user-agent': 'tcg.cards yugioh pack snapshot generator',
    },
  });

  if (!response.ok) {
    throw new Error(`packs page download failed with HTTP ${response.status}.`);
  }

  const html = await response.text();
  const sets = [...parsePanel(html, 'ocg'), ...parsePanel(html, 'tcg')];

  // The upstream lists a few cross-region packs (world championships, OTS
  // packs, collabs) in both tabs with the same pack id. One pack id maps to one
  // shared detail page, so keep only the first occurrence (the OCG-tab entry).
  const deduped = new Map<string, YugiohSet>();
  for (const set of sets) {
    if (!deduped.has(set.id)) {
      deduped.set(set.id, set);
    }
  }
  const unique = [...deduped.values()];
  if (unique.length !== sets.length) {
    console.log(`Dropped ${sets.length - unique.length} duplicate pack id entries.`);
  }

  unique.sort((left, right) => right.releasedAt?.localeCompare(left.releasedAt ?? '') ?? -1);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(unique, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${unique.length} packs to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

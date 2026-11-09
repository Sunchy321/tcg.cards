import { ORPCError, os } from '@orpc/server';
import z from 'zod';
import { diffArrays } from 'diff';

import type { RuleDiffItem, RuleItem } from '#model/magic/schema/rule';
import { ruleDiff, ruleHistory, ruleItem, ruleSummary } from '#model/magic/schema/rule';
import { listCrReleases, readCrRelease } from '@tcg-cards/console-api/lib/magic/documents/cr-reader';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { db } from '#db/db';
import { diffString, diffThreeString } from '#server/lib/diff';

/** Converts a compact imported release tag into the rule API's date format. */
function toDate(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

/** Reads a public edition and adapts its ordered nodes to the existing rule contract. */
async function readRules(date?: string, lang = 'en') {
  try {
    const store = createDocumentStore(db, 'remote');
    const { page } = await readCrRelease(store, date, lang);
    const contents: RuleItem[] = page.sections.map((node, index) => ({
      itemId:   node.entityId,
      index,
      depth:    node.level,
      serial:   node.serial,
      text:     node.text ?? '',
      richText: node.text ?? '',
    }));
    return { date: toDate(page.version.versionTag), lang, contents, compareEnabled: page.document.settings.compare };
  } catch (error) {
    if (error instanceof Error && /not found|missing/.test(error.message)) throw new ORPCError('NOT_FOUND');
    throw error;
  }
}

/** Keeps game symbols and rule references atomic when highlighting text changes. */
function encodeReferences(text: string, map: Record<string, string>): string {
  return text.replaceAll(/(\{[^}]+\}|\d+(?:\.\d+[a-z]?))/g, value => {
    map[value] ??= String.fromCodePoint(Object.keys(map).length + 0xF0000);
    return map[value];
  });
}

const list = os
  .route({ method: 'GET', description: 'List all rule dates', tags: ['Magic', 'Rule'] })
  .input(z.any())
  .output(z.string().array())
  .handler(async () => (await listCrReleases(createDocumentStore(db, 'remote')))
    .map(release => toDate(release.versionTag)))
  .callable();

const summary = os
  .route({ method: 'GET', description: 'Get rule summary', tags: ['Magic', 'Rule'] })
  .input(z.object({ date: z.iso.date(), lang: z.string().default('en') }))
  .output(ruleSummary)
  .handler(async ({ input }) => {
    const page = await readRules(input.date, input.lang);
    return {
      date:     page.date, lang:     input.lang,
      contents: page.contents.map(({ itemId, index, depth, serial, text }) => ({
        itemId, index, depth, serial, ...(/[a-z!]$/.test(text) ? { text } : {}),
      })),
    };
  })
  .callable();

const chapter = os
  .route({ method: 'GET', description: 'Get rule chapter', tags: ['Magic', 'Rule'] })
  .input(z.object({ date: z.iso.date(), lang: z.string().default('en'), from: z.int().min(0), to: z.int().min(0) }))
  .output(ruleItem.array())
  .handler(async ({ input }) => (await readRules(input.date, input.lang)).contents
    .filter(item => item.index >= input.from && item.index <= input.to))
  .callable();

const diff = os
  .route({ method: 'GET', description: 'Get rule difference', tags: ['Magic', 'Rule'] })
  .input(z.object({ from: z.iso.date(), to: z.iso.date(), lang: z.string().default('en') }))
  .output(ruleDiff)
  .handler(async ({ input }) => {
    const [from, to] = await Promise.all([readRules(input.from, input.lang), readRules(input.to, input.lang)]);
    if (!to.compareEnabled) throw new ORPCError('FORBIDDEN');
    const oldItems = new Map(from.contents.map(item => [item.itemId, item]));
    const newItems = new Map(to.contents.map(item => [item.itemId, item]));
    const sequence = diffArrays([...oldItems.keys()], [...newItems.keys()]);
    const added = new Set(sequence.filter(part => part.added).flatMap(part => part.value));
    const removed = new Set(sequence.filter(part => part.removed).flatMap(part => part.value));
    const rows: RuleDiffItem[] = [];
    for (const part of sequence) {
      for (const itemId of part.value) {
        if (part.removed && added.has(itemId)) continue;
        const before = oldItems.get(itemId);
        const after = newItems.get(itemId);
        const type = part.added
          ? removed.has(itemId) ? 'move' : 'add'
          : part.removed
            ? 'remove'
            : before?.depth !== after?.depth ? 'move' : undefined;
        if (type == null && before?.text === after?.text && before?.serial === after?.serial) continue;
        rows.push({
          itemId, type, serial: [before?.serial ?? null, after?.serial ?? null], depth:  [before?.depth, after?.depth],
          text:   diffString(before?.text ?? '', after?.text ?? '', encodeReferences).map(value => {
            if (typeof value === 'string') return { type: 'common' as const, value };
            const oldReference = from.contents.find(item => item.serial?.replace(/\.$/, '') === value[0].replace(/[.,;–]$/, ''));
            const newReference = to.contents.find(item => item.serial?.replace(/\.$/, '') === value[1].replace(/[.,;–]$/, ''));
            return { type: 'diff' as const, isMinor: oldReference != null && oldReference.itemId === newReference?.itemId, value };
          }),
        });
      }
    }
    return { from: input.from, to: input.to, diff: rows };
  })
  .callable();

const history = os
  .route({ method: 'GET', description: 'Get rule item history', tags: ['Magic', 'Rule'] })
  .input(z.object({ itemId: z.string(), lang: z.string().default('en') }))
  .output(ruleHistory)
  .handler(async ({ input }) => {
    const releases = (await listCrReleases(createDocumentStore(db, 'remote'))).reverse();
    const groups: { dates: string[], text: string }[] = [];
    for (const release of releases) {
      const page = await readRules(release.versionTag, input.lang);
      const item = page.contents.find(row => row.itemId === input.itemId);
      if (!item) continue;
      const last = groups.at(-1);
      if (last?.text === item.text) last.dates.push(page.date);
      else groups.push({ dates: [page.date], text: item.text });
    }
    if (groups.length === 0) throw new ORPCError('NOT_FOUND');
    return {
      itemId: input.itemId,
      diff:   groups.map((group, index) => ({ dates: group.dates,
        text:  diffThreeString(groups[index - 1]?.text ?? group.text, group.text, groups[index + 1]?.text ?? group.text),
      })),
    };
  })
  .callable();

export const ruleTrpc = { list, summary, chapter, diff, history };
export const ruleApi = { list, summary, chapter, diff, history };

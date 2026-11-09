import { ORPCError } from '@orpc/server';

import { db } from '@tcg-cards/db';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { createRuleReader } from '@tcg-cards/console-api/lib/magic/documents/rules';

import { os } from '../../orpc';

const reader = createRuleReader(createDocumentStore(db, 'remote'));

const list = os.magic.rule.list.handler(() => reader.list());
const versions = os.magic.rule.versions.handler(async ({ input }) => {
  const result = await reader.versions(input.ruleId);
  if (result == null) throw new ORPCError('NOT_FOUND');
  return result;
});
const meta = os.magic.rule.meta.handler(async ({ input, context }) => {
  const result = await createRuleReader(createDocumentStore(db, 'remote'), { assetBaseUrl: context.assetBaseUrl }).meta(input);
  if (result == null) throw new ORPCError('NOT_FOUND');
  return result;
});

const content = os.magic.rule.content.handler(async ({ input }) => {
  const result = await reader.content(input);
  if (result == null) throw new ORPCError('NOT_FOUND');
  return result;
});
const text = os.magic.rule.text.handler(async ({ input }) => {
  const result = await reader.content(input);
  if (result == null) throw new ORPCError('NOT_FOUND');
  const body = result.nodes.map(node => {
    // Synthetic anchors identify unnumbered paragraphs and must not become prose.
    const number = node.anchor != null && /^\d+(?:\.\d+)*[a-z]*$/.test(node.anchor) ? `${node.anchor}. ` : '';
    return `${number}${node.rawText}`;
  }).join('\n\n');
  // File output keeps the OpenAPI transport from JSON-encoding the text string.
  return new File([body], 'rules.txt', { type: 'text/plain; charset=utf-8' });
});

export const rule = { list, versions, meta, text, content };

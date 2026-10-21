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

export const rule = { list, versions, meta };

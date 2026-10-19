import { ORPCError } from '@orpc/server';
import z from 'zod';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createComparisonOperations } from '@tcg-cards/console-api/lib/magic/documents/comparison';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { db } from '#db/db';
import { os } from '#server/orpc';
import {
  documentDiffPage, documentEntityHistoryPage, documentReaderChapter, documentReaderPage, documentReaderSummary,
} from '#model/magic/schema/document-page';
import { documentAuthoring } from './document-authoring';

const readerInput = z.object({ slug: z.string(), versionTag: z.string().optional(), locale: z.string().default('en') });

/** Reads only formal serving content and maps absent documents to the existing HTTP contract. */
async function getReaderPage(input: z.infer<typeof readerInput>, actorId?: string) {
  try {
    return await createDocumentService(createDocumentStore(db, 'remote'), { track: 'remote', actorId }).read(input);
  } catch (error) {
    if (error instanceof Error && /not found|missing/.test(error.message)) throw new ORPCError('NOT_FOUND');
    throw error;
  }
}

const reader = os.input(readerInput).output(documentReaderPage)
  .handler(({ input, context }) => getReaderPage(input, context.user?.id));
const summary = os.input(readerInput).output(documentReaderSummary).handler(async ({ input, context }) => {
  const { _sections, ...page } = await getReaderPage(input, context.user?.id);
  return page;
});
const chapter = os.input(readerInput.extend({ chapterNodeId: z.string() })).output(documentReaderChapter)
  .handler(async ({ input, context }) => {
    const page = await getReaderPage(input, context.user?.id);
    if (!input.chapterNodeId || !page.document.settings.outline) return { chapterNodeId: input.chapterNodeId, sections: page.sections };
    const current = page.sections.find(section => section.nodeId === input.chapterNodeId);
    if (!current) throw new ORPCError('NOT_FOUND');
    return { chapterNodeId: current.nodeId, sections: page.sections.filter(section => section.path === current.path || section.path.startsWith(`${current.path}/`)) };
  });
const compare = os.input(z.object({ slug: z.string(), fromVersionTag: z.string(), toVersionTag: z.string(), locale: z.string().default('en') }))
  .output(documentDiffPage).handler(({ input, context }) =>
    createComparisonOperations(createDocumentStore(db, 'remote'), { track: 'remote', actorId: context.user?.id }).compare(input));
const nodeHistory = os.input(z.object({ documentId: z.string(), nodeKey: z.string() }))
  .output(documentEntityHistoryPage).handler(({ input, context }) =>
    createComparisonOperations(createDocumentStore(db, 'remote'), { track: 'remote', actorId: context.user?.id }).nodeHistory(input));
const search = os.input(z.object({ query: z.string().max(500), slug: z.string().optional(), language: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }))
  .handler(({ input }) => createDocumentService(createDocumentStore(db, 'remote'), { track: 'remote' }).search(input));

export const documentTrpc = { ...documentAuthoring, reader, summary, chapter, compare, nodeHistory, search };
export const documentApi = documentTrpc;

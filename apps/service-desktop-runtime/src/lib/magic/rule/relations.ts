import { and, desc, eq } from 'drizzle-orm';
import type { createDb } from '@tcg-cards/db/db';
import { TaskRun } from '@tcg-cards/db/schema/local/task';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { buildTaskPageSnapshot, createIdleTaskPageSnapshot } from '../../task/snapshot';
import { createTaskStore } from '../../task/store';
import { documentRelationsTaskType } from '../task/document-relations/definition';

/** Restore the latest persisted run and independently inspect committed relation readiness. */
export async function readRelationState(database: ReturnType<typeof createDb>, documentId: string) {
  const [versions, latest] = await Promise.all([
    createDocumentService(createDocumentStore(database, 'local'), { track: 'local' }).relationStatus({ documentId }).catch(async error => {
      // A rules page can be opened before the first import creates its document.
      const document = await createDocumentStore(database, 'local').document(documentId);
      if (document == null) return { versions: [] };
      throw error;
    }),
    database.select({ id: TaskRun.id }).from(TaskRun).where(and(
      eq(TaskRun.taskType, documentRelationsTaskType), eq(TaskRun.taskScopeType, 'document_relations'), eq(TaskRun.taskScopeKey, documentId),
    )).orderBy(desc(TaskRun.createdAt), desc(TaskRun.id)).limit(1),
  ]);
  const snapshot = latest[0] == null ? null : await createTaskStore(database).getTaskRun(latest[0].id);
  return { ...versions, task: snapshot == null ? createIdleTaskPageSnapshot() : buildTaskPageSnapshot(snapshot) };
}

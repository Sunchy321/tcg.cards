import type { createDb } from '@tcg-cards/db/db';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';

/** Inspect committed relation readiness without coupling the runtime route to task-host state. */
export async function readRelationState(database: ReturnType<typeof createDb>, documentId: string) {
  try {
    return await createDocumentService(createDocumentStore(database, 'local'), { track: 'local' }).relationStatus({ documentId });
  } catch (error) {
    // A rules page can be opened before the first import creates its document.
    const document = await createDocumentStore(database, 'local').document(documentId);
    if (document == null) return { versions: [] };
    throw error;
  }
}

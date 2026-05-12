import {
  index,
  jsonb,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from '../auth';
import { appSchema } from '../../shared/magic/schema';
import { ImportChangeSet, ImportFieldChange } from '../../local/magic/import';

/** JSON value payload stored in remote review overrides. */
type JsonValue = unknown;

/** Review scope attached to a local import candidate. */
type ImportReviewScopeType = 'change_set' | 'field_change' | 'batch';

/** Review action recorded for an import candidate. */
type ImportReviewAction = 'approve' | 'reject' | 'ignore' | 'override';

export const importReviewScopeType = appSchema.enum('import_review_scope_type', [
  'change_set',
  'field_change',
  'batch',
]);

export const importReviewAction = appSchema.enum('import_review_action', [
  'approve',
  'reject',
  'ignore',
  'override',
]);

export const ImportReviewAction = appSchema.table('import_review_actions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  changeSetId:   uuid('change_set_id').references(() => ImportChangeSet.id, { onDelete: 'cascade' }),
  fieldChangeId: uuid('field_change_id').references(() => ImportFieldChange.id, { onDelete: 'cascade' }),

  scopeType: importReviewScopeType('scope_type').$type<ImportReviewScopeType>().notNull(),
  scopeKey:  text('scope_key').notNull(),
  action:    importReviewAction('action').$type<ImportReviewAction>().notNull(),

  reviewerId:    text('reviewer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason:        text('reason'),
  overrideValue: jsonb('override_value').$type<JsonValue>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('import_review_actions_change_set_id_created_at_idx').on(table.changeSetId, table.createdAt),
  index('import_review_actions_field_change_id_created_at_idx').on(table.fieldChangeId, table.createdAt),
  index('import_review_actions_scope_type_scope_key_idx').on(table.scopeType, table.scopeKey),
  index('import_review_actions_reviewer_id_created_at_idx').on(table.reviewerId, table.createdAt),
]);

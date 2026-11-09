import { text, timestamp } from 'drizzle-orm/pg-core';
import { dataSchema } from '../../shared/magic/schema';

/** Series-maintenance choices kept independently of rebuildable display values. */
export const SetDisplayChoice = dataSchema.table('set_display_choices', {
  setId:           text('set_id').primaryKey(),
  symbolStyle:     text('symbol_style').array(),
  doubleFacedIcon: text('double_faced_icon').array(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

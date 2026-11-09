import { expect, test } from 'bun:test';
import { createDb } from '@tcg-cards/db';

import { announcementListQuery } from './announcement-list';

test('counts changes against the owning announcement rather than the change row id', async () => {
  // SQL generation does not open a connection; live data is verified through the site.
  const database = createDb('postgres://unused:unused@localhost/unused');
  try {
    const { sql } = announcementListQuery(database).toSQL();
    expect(sql).toContain('"magic"."announcement_items"."announcement_id" = "magic"."announcements"."id"');
    expect(sql).toContain('left join');
    expect(sql).toContain('count("magic"."announcement_items"."id")');
  } finally {
    await database.$client.end();
  }
});

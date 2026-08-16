import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { getLocalDb } from '../../hsdata-local-db';
import { ExtractedCard } from '@tcg-cards/db/schema/local/hearthstone';
import { projectExtracted } from './project';
import type { ExtractedCardRow } from './types';

describe('artist from unpack data', () => {
  test('projects artist_name from extracted_card into entity', async () => {
    const db = getLocalDb();

    // AT_001 at build 247416: extracted_card has artist_name "Nutthapon Petchthai"
    const cardId = 'AT_001';
    const build = 247416;

    const buildCards = await db.select()
      .from(ExtractedCard)
      .where(sql`${build} = any(${ExtractedCard.buildNumbers})`) as ExtractedCardRow[];

    const report = await projectExtracted(build, [cardId], true, buildCards);

    expect(report.insertedEntities + report.updatedEntities + report.reusedEntities).toBeGreaterThanOrEqual(1);
  });
});

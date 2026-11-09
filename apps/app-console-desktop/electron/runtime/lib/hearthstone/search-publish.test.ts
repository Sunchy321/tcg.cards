import { describe, expect, test } from 'bun:test';

import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { deleteRemoteRow, parseRowKey, rowHashOf, rowKeyOf } from './hsdata-publish';

describe('Hearthstone search publication', () => {
  test('uses the approved latest-only keys without historical revision fields', () => {
    expect(parseRowKey(rowKeyOf({ cardId: 'A' }, 'search_cards'))).toEqual({ cardId: 'A' });
    expect(parseRowKey(rowKeyOf({ cardId: 'A', lang: 'zhs' }, 'search_card_localizations')))
      .toEqual({ cardId: 'A', lang: 'zhs' });
  });

  test('ignores rebuild timestamps while retaining changes to necessary image and tag data', () => {
    const row = { cardId: 'A', simpleTags: { 12: false }, updatedAt: new Date(0) };
    expect(rowHashOf(row, 'search_cards')).toBe(rowHashOf({ ...row, updatedAt: new Date(1000) }, 'search_cards'));
    expect(rowHashOf(row, 'search_cards')).not.toBe(rowHashOf({ ...row, simpleTags: { 12: true } }, 'search_cards'));
    const localized = { cardId: 'A', lang: 'en', name: 'Name', text: 'Text', renderHash: 'one' };
    expect(rowHashOf(localized, 'search_card_localizations'))
      .not.toBe(rowHashOf({ ...localized, renderHash: 'two' }, 'search_card_localizations'));
  });

  test('soft-deletes both projected row kinds when their publication plan removes them', async () => {
    const writes: Array<{ table: unknown, values: Record<string, unknown> }> = [];
    const database = {
      /** Records UPDATEs; a DELETE would fail because this adapter deliberately has none. */
      update(table: unknown) {
        return {
          /** Retains the soft-delete values while accepting the generated key predicate. */
          set(values: Record<string, unknown>) {
            writes.push({ table, values });
            return { where: async () => undefined };
          },
        };
      },
    } as unknown as Parameters<typeof deleteRemoteRow>[0];
    await deleteRemoteRow(database, 'search_cards', { cardId: 'A' });
    await deleteRemoteRow(database, 'search_card_localizations', { cardId: 'A', lang: 'en' });
    expect(writes.map(write => write.table)).toEqual([SearchCard, SearchCardLocalization]);
    for (const write of writes) {
      expect(write.values.deletedAt).toBeInstanceOf(Date);
    }
  });
});

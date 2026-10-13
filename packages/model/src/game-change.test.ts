import { describe, expect, test } from 'bun:test';

import { defineChangeStatusByType, type ChangeStatusByTypeMap } from './game-change';
import { changeStatus, changeStatusByType, gameChangeType } from './hearthstone/schema/announcement';
import {
  changeStatus as magicChangeStatus,
  changeStatusByType as magicChangeStatusByType,
  gameChangeType as magicGameChangeType,
} from './magic/schema/announcement';

/** Every declared type has an entry, every status is in the game's enum, and every default is one of its statuses. */
function expectConsistentDeclaration(
  map: ChangeStatusByTypeMap<string, string>,
  types: readonly string[],
  statusOptions: readonly string[],
): void {
  const missing = types.filter(type => map[type] == null);
  expect(missing).toEqual([]);

  for (const type of types) {
    const entry = map[type]!;
    for (const status of entry.statuses) {
      expect(statusOptions).toContain(status);
    }
    if (entry.default != null) {
      expect(entry.statuses).toContain(entry.default);
    }
  }
}

describe('defineChangeStatusByType', () => {
  test('throws when a game change type has no entry', () => {
    expect(() =>
      defineChangeStatusByType(['a', 'b'], { a: { statuses: ['x'], default: 'x' } } as ChangeStatusByTypeMap<'a' | 'b', 'x'>),
    ).toThrow(/b/);
  });

  test('throws when the default status is not among the statuses', () => {
    expect(() =>
      defineChangeStatusByType(['a'], { a: { statuses: ['x'], default: 'y' } }),
    ).toThrow(/y/);
  });

  test('statuses and default infer as a literal union, not widened to string', () => {
    const declared: ChangeStatusByTypeMap<'a', 'x' | 'y'> = defineChangeStatusByType(['a'], {
      a: { statuses: ['x', 'y'], default: 'x' },
    });
    expect(declared.a.statuses).toEqual(['x', 'y']);
  });
});

describe('game status declarations', () => {
  test('hearthstone declaration is consistent with its enums', () => {
    expectConsistentDeclaration(changeStatusByType, gameChangeType.options, changeStatus.options);
  });

  test('magic declaration is consistent with its enums', () => {
    expectConsistentDeclaration(magicChangeStatusByType, magicGameChangeType.options, magicChangeStatus.options);
  });

  test('magic split and merge types carry no status', () => {
    expect(magicChangeStatusByType.card_split).toEqual({ statuses: [], default: null });
    expect(magicChangeStatusByType.card_merge).toEqual({ statuses: [], default: null });
  });
});

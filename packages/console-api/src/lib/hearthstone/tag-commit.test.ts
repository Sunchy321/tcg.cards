import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { tagListInput, tagUpdateInput } from '@tcg-cards/model/hearthstone/schema/tag';

import { buildTagRowRevision, getTagFieldValue, matchesTagRowRevision, matchesTagSearch, normalizeTagWrite, toTagProfile, type TagRow } from './tag-commit';

const legacy = {
  enumId:             190,
  slug:               'taunt',
  slugAliases:        [],
  rawName:            'TAUNT',
  rawType:            'Int',
  rawNames:           ['TAUNT'],
  normalizeKind:      'identity_int',
  normalizeConfig:    {},
  projectTargetType:  'entity',
  projectTargetPath:  'mechanics',
  projectKind:        'assign_mechanic',
  projectConfig:      {},
  status:             'configured',
  firstSeenSourceTag: null,
  lastSeenSourceTag:  null,
};

const row: TagRow = {
  ...legacy,
  createdAt:    new Date('2026-01-01T00:00:00.000Z'),
  updatedAt:    new Date('2026-01-01T00:00:00.000Z'),
  valueType:    null,
  localization: {},
};

/** Recreates the persisted revision format that included both retired columns. */
function legacyRevision(name: string | null, description: string | null = null) {
  const copy = { ...legacy, name, description };
  const previousPayload = Object.fromEntries(Object.entries(copy).sort(([left], [right]) => left.localeCompare(right)));
  const previousHash = createHash('sha256').update(JSON.stringify(previousPayload)).digest('hex');
  return `sha256:${previousHash}`;
}

test('pending pre-migration revisions accept null and source names but still check active fields', () => {
  expect(matchesTagRowRevision(row, buildTagRowRevision(row))).toBe(true);
  expect(matchesTagRowRevision(row, legacyRevision('TAUNT'))).toBe(true);
  expect(matchesTagRowRevision(row, legacyRevision(null))).toBe(true);
  expect(matchesTagRowRevision(row, legacyRevision('A new untranslated name'))).toBe(false);
  expect(matchesTagRowRevision({ ...row, slug: 'renamed' }, legacyRevision('TAUNT'))).toBe(false);
  expect(matchesTagRowRevision({ ...row, localization: { zhs: { name: '嘲讽' } } }, legacyRevision('TAUNT'))).toBe(false);
});

test('a migration may replay an exact old copy without ignoring later localization changes', () => {
  const description = 'Forces enemies to attack this minion first.';
  const migrated = { ...row, localization: { en: { description } } };
  const revision = legacyRevision('TAUNT', description);

  expect(matchesTagRowRevision(migrated, revision)).toBe(false);
  expect(matchesTagRowRevision(migrated, revision, true)).toBe(true);
  expect(matchesTagRowRevision({ ...migrated, slug: 'renamed' }, revision, true)).toBe(false);
  expect(matchesTagRowRevision({ ...migrated, localization: { en: { description: 'Later edit' } } }, revision, true)).toBe(false);
  expect(matchesTagRowRevision({ ...migrated, localization: { ...migrated.localization, zhs: { description: '后加的说明' } } }, revision, true)).toBe(false);
});

test('legacy edits retain localized copy and the semantic value type', () => {
  const current = {
    ...row,
    valueType:    'boolean' as const,
    localization: { zhs: { name: '嘲讽' } },
  };
  const input = tagUpdateInput.parse({
    enumId:            190,
    slug:              'taunt',
    name:              'TAUNT',
    rawName:           'TAUNT',
    rawType:           'Int',
    normalizeKind:     'identity_int',
    projectTargetType: 'entity',
    projectTargetPath: 'mechanics',
    projectKind:       'assign_mechanic',
    status:            'configured',
    description:       null,
  });

  expect(normalizeTagWrite(input, current)).toMatchObject({
    valueType:    'boolean',
    localization: { zhs: { name: '嘲讽' } },
  });
  expect(normalizeTagWrite({ ...input, valueType: null }, current).valueType).toBeNull();
  expect(tagUpdateInput.parse({ ...input, valueType: 'multipurpose' }).valueType).toBe('multipurpose');
  expect(tagUpdateInput.safeParse({ ...input, valueType: ['boolean'] }).success).toBe(false);
  expect(() => normalizeTagWrite({ ...input, description: 'Untranslated old copy' }, current)).toThrow('in its language');
});

test('saving a stale form preserves untouched localization and rejects stale copy edits', () => {
  const expectedLocalization = { en: { name: 'Taunt' } };
  const current = { ...row, localization: { ...expectedLocalization, zhs: { name: '嘲讽' } } };
  const input = tagUpdateInput.parse({
    enumId:            row.enumId,
    slug:              row.slug,
    rawName:           row.rawName,
    rawType:           row.rawType,
    normalizeKind:     row.normalizeKind,
    projectTargetPath: row.projectTargetPath,
    projectKind:       row.projectKind,
    status:            row.status,
    localization:      expectedLocalization,
    expectedLocalization,
  });

  expect(normalizeTagWrite(input, current).localization).toEqual(current.localization);
  const changed = { ...input, localization: { en: { name: 'Updated Taunt' } } };
  expect(() => normalizeTagWrite(changed, current)).toThrow('has changed');
  const reloaded = { ...changed, localization: { ...current.localization, ...changed.localization }, expectedLocalization: current.localization };
  expect(normalizeTagWrite(reloaded, current).localization).toEqual(reloaded.localization);
});

test('both conflict paths can report current values for retired fields', () => {
  const current = { ...row, localization: { en: { name: 'Taunt', description: 'A description.' } } };
  expect(getTagFieldValue(current, 'tag.name')).toBe('Taunt');
  expect(getTagFieldValue(current, 'tag.description')).toBe('A description.');
  expect(getTagFieldValue(current, 'tag')).toBeNull();
});

test('explicit no projection removes its destination and keeps the display-name fallback', () => {
  const input = tagUpdateInput.parse({
    enumId:            190,
    slug:              'taunt',
    rawName:           'TAUNT',
    rawType:           'Int',
    normalizeKind:     'identity_int',
    projectTargetPath: 'mechanics',
    projectKind:       'none',
    projectConfig:     { key: '190' },
    status:            'configured',
  });
  const next = normalizeTagWrite(input, row);

  expect(next).toMatchObject({
    projectKind:       'none',
    projectTargetType: null,
    projectTargetPath: null,
    projectConfig:     {},
  });
  expect(toTagProfile({ ...row, ...next })).toMatchObject({ name: 'TAUNT', description: null, projectTargetType: null });
});

test('the unconfigured projection filter does not include explicitly absent tags', () => {
  const input = tagListInput.parse({ projectKind: null });

  expect(matchesTagSearch(toTagProfile({ ...row, projectKind: null }), input)).toBe(true);
  expect(matchesTagSearch(toTagProfile({ ...row, projectKind: 'none' }), input)).toBe(false);
});

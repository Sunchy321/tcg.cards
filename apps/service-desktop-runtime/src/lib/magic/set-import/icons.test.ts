import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { applyIconWork, emptyIconReport, planIconWork, recordIconResult, type IconReport } from './icons';
import type { SourceSeries } from './series';

/** Temp directories created by the tests, removed together at the end. */
const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

/** Minimal Scryfall series rows used by the planning examples. */
const source = (code: string, setType: string, iconUri?: string): SourceSeries => ({
  id:           `00000000-0000-4000-8000-${(source.sequence++).toString(16).padStart(12, '0')}`, code, name:         code, set_type:     setType,
  card_count:   1, digital:      false, foil_only:    false, nonfoil_only: false, icon_svg_uri: iconUri,
});
source.sequence = 1;

describe('set icon planning', () => {
  test('copies every vector rarity under lowercase canonical names, skipping hidden catalogs and absent files', () => {
    const vectors = mkdtempSync(join(tmpdir(), 'vectors-'));
    tempRoots.push(vectors);
    for (const set of ['10E', '.alt', '2X2']) {
      mkdirSync(join(vectors, 'svg', 'optimized', 'set', set), { recursive: true });
      for (const file of ['C.svg', 'U.svg', 'R.svg', 'M.svg', 'T.svg', '80.svg']) {
        writeFileSync(join(vectors, 'svg', 'optimized', 'set', set, file), file);
      }
    }
    rmSync(join(vectors, 'svg', 'optimized', 'set', '2X2', 'M.svg'));

    const plan = planIconWork([], vectors, '/icons');
    expect(plan.work.map(w => [w.set, w.file])).toEqual([
      ['10e', 'common.svg'], ['10e', 'uncommon.svg'], ['10e', 'rare.svg'], ['10e', 'mythic.svg'],
      ['2x2', 'common.svg'], ['2x2', 'uncommon.svg'], ['2x2', 'rare.svg'],
    ]);
    expect(plan.work.every(w => w.target === join('/icons', 'icon', w.set, w.file))).toBe(true);
    expect(plan.missingDefaults).toEqual([]);
  });

  test('downloads Scryfall defaults except series inheriting their parent icon or lacking a source', () => {
    const sources = [
      source('Neo', 'expansion', 'https://img.scryfall.io/sets/neo.svg'),
      source('PNeo', 'promo', 'https://img.scryfall.io/sets/pneo.svg'),
      source('Mh3', 'masters', 'https://img.scryfall.io/sets/mh3.svg'),
      source('Tsp', 'expansion'),
    ];
    const plan = planIconWork(sources, null, '/icons');
    expect(plan.work.map(w => [w.set, w.file, w.url])).toEqual([
      ['mh3', 'default.svg', 'https://img.scryfall.io/sets/mh3.svg'],
      ['neo', 'default.svg', 'https://img.scryfall.io/sets/neo.svg'],
    ]);
    expect(plan.missingDefaults).toEqual(['tsp']);
  });

  test('keeps an unconfigured vector source to defaults only', () => {
    const plan = planIconWork([source('Neo', 'expansion', 'https://img.scryfall.io/sets/neo.svg')], null, '/icons');
    expect(plan.work).toHaveLength(1);
    expect(plan.work[0]!.file).toBe('default.svg');
  });
});

describe('set icon placement', () => {
  test('writes new and changed files and skips identical bytes in place', async () => {
    const root = mkdtempSync(join(tmpdir(), 'icons-'));
    tempRoots.push(root);
    const target = join(root, 'icon', 'neo', 'common.svg');
    writeFileSync(join(root, 'a.svg'), '<svg a/>');

    expect(await applyIconWork({ set: 'neo', file: 'common.svg', target, source: join(root, 'a.svg') })).toBe('written');
    expect(readFileSync(target, 'utf8')).toBe('<svg a/>');
    expect(await applyIconWork({ set: 'neo', file: 'common.svg', target, source: join(root, 'a.svg') })).toBe('unchanged');

    writeFileSync(join(root, 'b.svg'), '<svg b/>');
    expect(await applyIconWork({ set: 'neo', file: 'common.svg', target, source: join(root, 'b.svg') })).toBe('written');
    expect(readFileSync(target, 'utf8')).toBe('<svg b/>');
  });

  test('force rewrites files whose stored bytes already match the source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'icons-force-'));
    tempRoots.push(root);
    const target = join(root, 'icon', 'neo', 'common.svg');
    mkdirSync(join(root, 'icon', 'neo'), { recursive: true });
    writeFileSync(join(root, 'a.svg'), '<svg a/>');
    writeFileSync(target, '<svg a/>');

    expect(await applyIconWork({ set: 'neo', file: 'common.svg', target, source: join(root, 'a.svg') })).toBe('unchanged');
    expect(await applyIconWork({ set: 'neo', file: 'common.svg', target, source: join(root, 'a.svg') }, true)).toBe('written');
    expect(readFileSync(target, 'utf8')).toBe('<svg a/>');
  });

  test('tallies touched series and written files per placement', () => {
    const report: IconReport = emptyIconReport();
    recordIconResult(report, { set: 'neo', file: 'common.svg', target: '/x' }, 'written');
    recordIconResult(report, { set: 'neo', file: 'rare.svg', target: '/y' }, 'written');
    recordIconResult(report, { set: '10e', file: 'default.svg', target: '/z' }, 'unchanged');
    expect(report).toMatchObject({ written: 2, unchanged: 1 });
    expect([...report.touched]).toEqual(['neo']);
  });
});

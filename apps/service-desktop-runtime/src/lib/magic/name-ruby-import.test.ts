import { afterAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractNameRubyRows, resolveCardDatabasePath } from './name-ruby-import';

const dir = mkdtempSync(join(tmpdir(), 'ruby-import-'));
const dbPath = join(dir, 'Raw_CardDatabase.mtga');

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE Localizations_jaJP (LocId INT NOT NULL, Formatted INT NOT NULL, Loc TEXT);
  CREATE TABLE Cards (
    GrpId INT, TitleId INT, ExpansionCode TEXT, CollectorNumber TEXT
  );
`);
// Variant preference: the lowest Formatted (template, full-width) wins.
db.prepare('INSERT INTO Localizations_jaJP VALUES (?, ?, ?)').run(10, 1, '悪(あく)斬(ざん)の天(てん)使(し)');
db.prepare('INSERT INTO Localizations_jaJP VALUES (?, ?, ?)').run(10, 0, '悪（あく）斬（ざん）の天（てん）使（し）');
db.prepare('INSERT INTO Localizations_jaJP VALUES (?, ?, ?)').run(11, 0, '稲妻');
db.prepare('INSERT INTO Localizations_jaJP VALUES (?, ?, ?)').run(12, 0, '包囲（ほうい）の搭（とう）');

db.prepare('INSERT INTO Cards VALUES (?, ?, ?, ?)').run(1, 10, 'EOE', '1');
db.prepare('INSERT INTO Cards VALUES (?, ?, ?, ?)').run(2, 11, 'EOE', '2');
db.prepare('INSERT INTO Cards VALUES (?, ?, ?, ?)').run(3, 12, 'eoc', '3');
db.prepare('INSERT INTO Cards VALUES (?, ?, ?, ?)').run(4, 10, 'XXX', '9');
db.prepare('INSERT INTO Cards VALUES (?, ?, ?, ?)').run(5, 10, 'eoe', '2');

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const anchors = new Map<string, Set<string>>([
  ['eoe:1', new Set(['悪斬の天使'])],
  ['eoc:3', new Set(['包囲の搭'])],
  ['eoe:2', new Set(['別の名前'])],
]);

describe('extractNameRubyRows', () => {
  const { rows, counts } = extractNameRubyRows(db, anchors);

  test('prefers the template variant and anchors the cleaned name', () => {
    expect(rows).toEqual([
      { lang: 'ja', kind: 'name', name: '悪斬の天使', rubyName: '悪（あく）斬（ざん）の天（てん）使（し）', source: 'mtga_loc', status: 'draft' },
      { lang: 'ja', kind: 'name', name: '包囲の搭', rubyName: '包囲（ほうい）の搭（とう）', source: 'mtga_loc', status: 'draft' },
    ]);
    expect(counts.anchored).toBe(2);
    expect(counts.glossed).toBe(4);
  });

  test('counts plain names, unanchored and mismatched candidates', () => {
    // GrpId 2 (稲妻, no gloss) is scanned but not a candidate.
    expect(counts.cards).toBe(5);
    // GrpId 4 (XXX:9) has no anchor; GrpId 5 (eoe:2) cleans to a name that is
    // not the anchored surface name.
    expect(counts.unanchored).toBe(1);
    expect(counts.mismatched).toBe(1);
    expect(counts.invalid).toBe(0);
  });
});

describe('resolveCardDatabasePath', () => {
  test('verifies the manifest sha256 and rejects a mismatched file', () => {
    const manifest = join(dir, 'Manifest.mtga');
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const good = createHash('sha256').update(require('node:fs').readFileSync(dbPath)).digest('base64');
    require('node:fs').writeFileSync(manifest, JSON.stringify({
      Assets: [{ Name: 'Raw_CardDatabase_deadbeef.mtga', sha256: good }],
    }));
    expect(resolveCardDatabasePath(dir)).toBe(dbPath);

    require('node:fs').writeFileSync(manifest, JSON.stringify({
      Assets: [{ Name: 'Raw_CardDatabase_deadbeef.mtga', sha256: 'wrong==' }],
    }));
    expect(() => resolveCardDatabasePath(dir)).toThrow(/sha256 mismatch/);
    require('node:fs').rmSync(manifest);
  });

  test('falls back to the conventional file when no manifest exists', () => {
    expect(resolveCardDatabasePath(dir)).toBe(dbPath);
  });
});

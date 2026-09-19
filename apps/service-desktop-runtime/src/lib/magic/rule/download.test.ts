import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { applyPathOverrides } from '../../../runtime-config';
import { downloadLatestRules, ensureRuleDir, toDashedDate } from './download';
import { listLocalRuleVersions } from './list';
import { extractLinks, extractVersionDateFromFilename } from './source';

const rulesPageHtml = `
  <html><body>
    <a href="/media/wpn/20240202_wrn_MagicCompRules_20240202.txt">TXT</a>
    <a href="https://magic.wizards.com/media/20240202_wrn_MagicCompRules.docx">DOCX</a>
    <a href="https://example.com/rules/20240202_wrn_MagicCompRules.pdf">PDF</a>
    <a href="/media/wpn/20240202_release_notes.html">Notes</a>
  </body></html>
`;

afterEach(() => {
  applyPathOverrides({});
});

describe('extractLinks', () => {
  test('collects txt, docx, and pdf links and resolves relative URLs', () => {
    expect(extractLinks(rulesPageHtml)).toEqual({
      txt:  'https://magic.wizards.com/media/wpn/20240202_wrn_MagicCompRules_20240202.txt',
      docx: 'https://magic.wizards.com/media/20240202_wrn_MagicCompRules.docx',
      pdf:  'https://example.com/rules/20240202_wrn_MagicCompRules.pdf',
    });
  });

  test('keeps the last link per format and ignores other extensions', () => {
    const links = extractLinks('<a href="/a.txt">a</a><a href="/b.txt">b</a><a href="/c.zip">c</a>');
    expect(links.txt).toBe('https://magic.wizards.com/b.txt');
    expect(links.docx).toBeUndefined();
    expect(links.pdf).toBeUndefined();
  });
});

describe('extractVersionDateFromFilename', () => {
  test('reads the YYYYMMDD date from a rules filename', () => {
    expect(extractVersionDateFromFilename('https://magic.wizards.com/media/wpn/20240202_wrn_MagicCompRules_20240202.txt'))
      .toBe('20240202');
    expect(extractVersionDateFromFilename('https://magic.wizards.com/media/wrn/20240202%20wrn_MagicCompRules.pdf'))
      .toBe('20240202');
  });

  test('returns null without a date or with an invalid URL', () => {
    expect(extractVersionDateFromFilename('https://magic.wizards.com/rules.txt')).toBeNull();
    expect(extractVersionDateFromFilename('not a url')).toBeNull();
  });
});

describe('toDashedDate', () => {
  test('converts the compact Wizards date to the archive form', () => {
    expect(toDashedDate('20240202')).toBe('2024-02-02');
    expect(toDashedDate('19991101')).toBe('1999-11-01');
  });
});

describe('listLocalRuleVersions', () => {
  test('scans per-format subfolders, merging legacy .doc files, newest first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rule-'));
    mkdirSync(join(dir, 'txt'), { recursive: true });
    mkdirSync(join(dir, 'pdf'), { recursive: true });
    mkdirSync(join(dir, 'doc'), { recursive: true });
    writeFileSync(join(dir, 'txt', '2024-02-02.txt'), 'rules');
    writeFileSync(join(dir, 'pdf', '2024-02-02.pdf'), 'pdf');
    writeFileSync(join(dir, 'doc', '2024-02-02.docx'), 'docx');
    writeFileSync(join(dir, 'txt', '2023-04-14.txt'), 'older');
    writeFileSync(join(dir, 'doc', '2023-04-14.doc'), 'legacy doc');
    writeFileSync(join(dir, 'doc', 'notes.docx'), 'not a version');
    writeFileSync(join(dir, '2024-02-02.txt'), 'flat layout is not the archive form');

    expect(listLocalRuleVersions(dir)).toEqual([
      { date: '2024-02-02', files: { txt: true, doc: true, pdf: true } },
      { date: '2023-04-14', files: { txt: true, doc: true, pdf: false } },
    ]);

    rmSync(dir, { recursive: true, force: true });
  });

  test('returns empty for a missing directory', () => {
    expect(listLocalRuleVersions('/nonexistent/rule-dir')).toEqual([]);
  });
});

describe('ensureRuleDir', () => {
  test('prefers the explicit rule override', () => {
    const root = mkdtempSync(join(tmpdir(), 'rule-'));
    const override = join(root, 'custom');
    applyPathOverrides({ 'magic.image.rule': override });

    expect(ensureRuleDir()).toBe(override);
    expect(existsSync(override)).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  test('creates the derived leaf under the magic image root', () => {
    const root = mkdtempSync(join(tmpdir(), 'rule-'));
    applyPathOverrides({ asset: root });

    expect(ensureRuleDir()).toBe(join(root, 'magic', 'rule'));
    expect(existsSync(join(root, 'magic', 'rule'))).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  test('throws when no image root is configured', () => {
    expect(() => ensureRuleDir()).toThrow('magic.image.rule path is not configured');
  });
});

describe('downloadLatestRules', () => {
  test('writes the archive layout, normalizes the txt, skips rejected formats, and is idempotent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rule-'));
    applyPathOverrides({ asset: root });

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://magic.wizards.com/en/rules') {
        return new Response(rulesPageHtml);
      }
      if (url.endsWith('.txt')) {
        return new Response('\uFEFFChapter 1.\r\nRule 104.1.\r\n');
      }
      if (url.endsWith('.docx')) {
        return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const result = await downloadLatestRules();

      expect(result).toMatchObject({
        version:    '2024-02-02',
        downloaded: true,
        files:      ['txt/2024-02-02.txt', 'doc/2024-02-02.docx'],
      });

      const ruleDir = join(root, 'magic', 'rule');
      expect(readFileSync(join(ruleDir, 'txt', '2024-02-02.txt'), 'utf8')).toBe('Chapter 1.\nRule 104.1.\n');
      expect(readFileSync(join(ruleDir, 'doc', '2024-02-02.docx')).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);

      const second = await downloadLatestRules();
      expect(second.downloaded).toBe(false);
      expect(second.files).toEqual(['txt/2024-02-02.txt', 'doc/2024-02-02.docx']);
    } finally {
      globalThis.fetch = realFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('treats an existing legacy .doc as filling the doc slot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rule-'));
    applyPathOverrides({ asset: root });
    mkdirSync(join(root, 'magic', 'rule', 'doc'), { recursive: true });
    writeFileSync(join(root, 'magic', 'rule', 'doc', '2024-02-02.doc'), 'legacy');

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://magic.wizards.com/en/rules') {
        return new Response(rulesPageHtml);
      }
      if (url.endsWith('.txt')) {
        return new Response('rules');
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const result = await downloadLatestRules();
      expect(result.files).toEqual(['txt/2024-02-02.txt', 'doc/2024-02-02.doc']);
      expect(existsSync(join(root, 'magic', 'rule', 'doc', '2024-02-02.docx'))).toBe(false);
      expect(existsSync(join(root, 'magic', 'rule', 'doc', '2024-02-02.doc'))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

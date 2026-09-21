import { describe, expect, test } from 'bun:test';

import {
  flattenNameRuby,
  nameRubyKey,
  normalizeRubyParens,
  parseNameRuby,
  resolveNameRuby,
  stripNameRuby,
  validateNameRuby,
  type NameRubyLookup,
} from './name-ruby';

describe('stripNameRuby', () => {
  test('strips per-character glosses back to the plain name', () => {
    expect(stripNameRuby('反（はん）射（しゃ）池（いけ）')).toBe('反射池');
    expect(stripNameRuby('悪(あく)斬(ざん)の天(てん)使(し)')).toBe('悪斬の天使');
  });

  test('strips a dangling truncated gloss', () => {
    expect(stripNameRuby('リリアナの軍旗手（しゅ')).toBe('リリアナの軍旗手');
  });

  test('strips a mixed-width gloss', () => {
    expect(stripNameRuby('突然変異の捕食（しょく)')).toBe('突然変異の捕食');
  });

  test('survives nested and stray parentheses', () => {
    expect(stripNameRuby('髑（どく）髏（ろ）胞（ほう）子（（し）の結（けっ）節（せつ）点（てん）')).toBe('髑髏胞子の結節点');
  });

  test('keeps parentheses whose content is not kana', () => {
    expect(stripNameRuby('賭（か）け「(マナ能力は対象にできない)」')).toBe('賭け「(マナ能力は対象にできない)」');
  });

  test('leaves clean names untouched', () => {
    expect(stripNameRuby('稲妻')).toBe('稲妻');
    expect(stripNameRuby('包囲の搭')).toBe('包囲の搭');
  });
});

describe('normalizeRubyParens', () => {
  test('maps half-width parentheses to full-width and leaves the rest alone', () => {
    expect(normalizeRubyParens('捕食（しょく)')).toBe('捕食（しょく）');
    expect(normalizeRubyParens('悪（あく）斬（ざん）')).toBe('悪（あく）斬（ざん）');
  });
});

describe('parseNameRuby', () => {
  test('splits per-character readings of the MTGA form', () => {
    expect(parseNameRuby('悪（あく）斬（ざん）の天（てん）使（し）')).toEqual([
      { text: '悪', ruby: 'あく' },
      { text: '斬', ruby: 'ざん' },
      { text: 'の' },
      { text: '天', ruby: 'てん' },
      { text: '使', ruby: 'し' },
    ]);
  });

  test('splits word-level readings', () => {
    expect(parseNameRuby('包囲（ほうい）の搭（とう）')).toEqual([
      { text: '包囲', ruby: 'ほうい' },
      { text: 'の' },
      { text: '搭', ruby: 'とう' },
    ]);
  });

  test('accepts a half-width-annotated string via its base runs', () => {
    // Bases are emitted verbatim; storage normalization is the caller's call.
    expect(parseNameRuby('反(はん)射(しゃ)池(いけ)')).toEqual([
      { text: '反', ruby: 'はん' },
      { text: '射', ruby: 'しゃ' },
      { text: '池', ruby: 'いけ' },
    ]);
  });

  test('accepts katakana readings — a qualifier reading is structurally valid and excluded at import, not here', () => {
    expect(parseNameRuby('親和（アーティファクト）')).toEqual([{ text: '親和', ruby: 'アーティファクト' }]);
  });

  test('keeps hiragana base runs literal', () => {
    expect(parseNameRuby('群（ぐん）れ率（ひき）い')).toEqual([
      { text: '群', ruby: 'ぐん' },
      { text: 'れ' },
      { text: '率', ruby: 'ひき' },
      { text: 'い' },
    ]);
  });

  test('rejects real-world malformed samples', () => {
    // Truncated on Gatherer and Scryfall alike.
    expect(parseNameRuby('リリアナの軍旗手（しゅ')).toBeNull();
    // Mixed-width pair.
    expect(parseNameRuby('突然変異の捕食（しょく)')).toBeNull();
    // Doubled open parenthesis — the inner paren fails the kana check.
    expect(parseNameRuby('髑（どく）髏（ろ）胞（ほう）子（（し）の結（けっ）節（せつ）点（てん）')).toBeNull();
    // Empty reading.
    expect(parseNameRuby('稲妻（）')).toBeNull();
    // A reading with nothing to annotate.
    expect(parseNameRuby('（ほ）')).toBeNull();
    // A reading with a non-kana character.
    expect(parseNameRuby('稲妻（いなずま!)')).toBeNull();
    // Lone closing parenthesis.
    expect(parseNameRuby('稲妻）')).toBeNull();
    // An annotation without any reading annotates nothing.
    expect(parseNameRuby('稲妻')).toBeNull();
  });
});

describe('validateNameRuby', () => {
  test('returns the normalized annotation when the base rebuilds the name', () => {
    expect(validateNameRuby('稲妻', '稲妻(いなずま)')).toBe('稲妻（いなずま）');
    expect(validateNameRuby('稲妻', '稲妻（いなずま）')).toBe('稲妻（いなずま）');
  });

  test('returns null when the base does not rebuild the name', () => {
    expect(validateNameRuby('稲妻', '雷（いなずま）')).toBeNull();
    expect(validateNameRuby('包囲の搭', '包囲（ほうい）の塔（とう）')).toBeNull();
  });

  test('returns null for malformed annotations', () => {
    expect(validateNameRuby('稲妻', '稲妻（いなずま')).toBeNull();
  });
});

describe('flattenNameRuby', () => {
  test('reads annotated runs as kana and literal runs as-is', () => {
    expect(flattenNameRuby(parseNameRuby('包囲（ほうい）の搭（とう）')!)).toBe('ほういのとう');
    expect(flattenNameRuby(parseNameRuby('悪（あく）斬（ざん）の天（てん）使（し）')!)).toBe('あくざんのてんし');
  });
});

describe('resolveNameRuby', () => {
  const lookup: NameRubyLookup = new Map([
    // Half-width entries are legacy-shaped input: the resolver normalizes them
    // to the full-width storage form.
    [nameRubyKey('ja', 'name', '稲妻'), {
      rubyName:   '稲妻(いなずま)',
      exceptions: { 'leb:1': '稲妻(いなづま)' },
    }],
    [nameRubyKey('ja', 'name', '壊れた行'), { rubyName: '壊れた行（ゆき）', exceptions: null }],
    [nameRubyKey('ja', 'flavor_name', '原始の王者、ゴジラ'), { rubyName: '原（げん）始（し）の王（おう）者（じゃ）、ゴジラ', exceptions: null }],
  ]);

  test('resolves the default annotation in the normalized storage form', () => {
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'name', name: '稲妻' })).toBe('稲妻（いなずま）');
  });

  test('resolves the set:number exception over the default', () => {
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'name', name: '稲妻', set: 'leb', number: '1' })).toBe('稲妻（いなづま）');
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'name', name: '稲妻', set: 'leb', number: '2' })).toBe('稲妻（いなずま）');
  });

  test('resolves flavor-name entries under their own kind', () => {
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'flavor_name', name: '原始の王者、ゴジラ' })).toBe('原（げん）始（し）の王（おう）者（じゃ）、ゴジラ');
  });

  test('returns null on lookup miss', () => {
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'name', name: '渦' })).toBeNull();
    expect(resolveNameRuby(lookup, { lang: 'en', kind: 'name', name: '稲妻' })).toBeNull();
  });

  test('returns null on a corrupt entry instead of guessing', () => {
    lookup.set(nameRubyKey('ja', 'name', '壊れた行'), { rubyName: '壊れた（行', exceptions: null });
    expect(resolveNameRuby(lookup, { lang: 'ja', kind: 'name', name: '壊れた行' })).toBeNull();
  });
});

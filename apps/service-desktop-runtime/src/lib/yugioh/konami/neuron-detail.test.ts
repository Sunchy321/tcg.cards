import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  decodeEntities,
  fetchNeuronDetail,
  isNeuronNoDataPage,
  NEURON_NO_DATA_MARKERS,
  neuronDetailUrl,
  neuronPageHasCard,
  parseNeuronDetail,
} from './neuron-detail';

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

const jaPage = fixture('neuron-detail-4007.html');
const nameEqualsRubyPage = fixture('neuron-detail-4031.html');
const annotatedEnglishPage = fixture('neuron-detail-4555.html');
const spellPage = fixture('neuron-detail-spell.html');
const notePage = fixture('neuron-detail-6199-en.html');
const annotatedRenamePage = fixture('neuron-detail-6199-de.html');
const enPage = fixture('neuron-detail-4007-en.html');
const aePage = fixture('neuron-detail-4007-ae.html');
const dePage = fixture('neuron-detail-4007-de.html');
const xyzPage = fixture('neuron-detail-xyz.html');
const linkPage = fixture('neuron-detail-link.html');
const pendulumPage = fixture('neuron-detail-pendulum.html');

describe('parseNeuronDetail (ja)', () => {
  const data = parseNeuronDetail(jaPage, 4007, 'ja');

  test('parses the main card names of the captured Blue-Eyes page', () => {
    expect(data.cid).toBe(4007);
    expect(data.locale).toBe('ja');
    expect(data.name).toBe('青眼の白龍');
    expect(data.ruby).toBe('ブルーアイズ・ホワイト・ドラゴン');
    expect(data.enName).toBe('Blue-Eyes White Dragon');
  });

  test('parses attributes, stats, species, and card text', () => {
    expect(data.attribute).toBe('光属性');
    expect(data.level).toBe(8);
    expect(data.rank).toBeNull();
    expect(data.atk).toBe('3000');
    expect(data.def).toBe('2500');
    expect(data.species).toBe('ドラゴン族');
    expect(data.typeText).toBe('通常');
    expect(data.text).toBe('高い攻撃力を誇る伝説のドラゴン。どんな相手でも粉砕する、その破壊力は計り知れない。');
    expect(data.note).toBeNull();
  });

  test('parses the image version indices with gaps preserved', () => {
    expect(data.imageIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19]);
  });

  test('parses every print entry of the print list', () => {
    expect(data.prints.length).toBe(71);
    expect(data.prints[0]).toMatchObject({
      releaseDate: '2026-09-26',
      cardNo:      'YAC1-JP073',
      packName:    'ORIGINAL ARTWORK COLLECTION',
      rarityCode:  'UR',
      rarityName:  'ウルトラレア仕様',
    });
    const withPackId = data.prints.find(print => print.packId !== null);
    expect(withPackId?.packId).toMatch(/^\d+$/);
  });

  test('keeps promo entries without a card number as null', () => {
    const withoutNumber = data.prints.filter(print => print.cardNo === null);
    expect(withoutNumber.length).toBeGreaterThan(0);
    const packNames = withoutNumber.map(print => print.packName);
    expect(packNames).toContain('25th ANNIVERSARY ULTIMATE KAIBA SET『青眼の白龍』（シークレットレア仕様）3枚セット');
  });

  test('does not leak related-card data into the main card', () => {
    // The related-card text lives outside the CardSet section and must not
    // replace the main card's own text.
    expect(data.text).not.toContain('ブルーアイズ」モンスター１体を墓地へ送り');
    // Related cards are not prints.
    expect(data.prints.some(print => print.packName === '青き眼の威光')).toBe(false);
  });

  test('reads a card whose name equals its reading', () => {
    // All-katakana names (インプ) make the site emit only the ruby span; the
    // reading doubles as the name and the parse must not fail.
    const data = parseNeuronDetail(nameEqualsRubyPage, 4031, 'ja');
    expect(data.name).toBe('インプ');
    expect(data.ruby).toBe('インプ');
    expect(data.enName).toBeNull();
    expect(data.attribute).toBe('闇属性');
    expect(data.text).toContain('闇に住む小さなオニ');
  });

  test('keeps the Japanese name when the reading duplicates it and an English span follows', () => {
    // Same collision as above, but the page also carries an English span —
    // matching by value would pick the English name; the structure must win.
    // The English span's rename annotation is split off too.
    const data = parseNeuronDetail(annotatedEnglishPage, 4555, 'ja');
    expect(data.name).toBe('カエルスライム');
    expect(data.ruby).toBe('カエルスライム');
    expect(data.enName).toBe('Slime Toad');
    expect(data.nameAnnotation).toBeNull();
  });

  test('throws when the page carries no main card', () => {
    const shell = '<html><head><title>遊戯王ニューロン</title></head><body></body></html>';
    expect(() => parseNeuronDetail(shell, 1, 'ja')).toThrow('no CardSet section');
  });
});

describe('parseNeuronDetail (other locales)', () => {
  test('reads the English page: localized labels, TCG prints', () => {
    const data = parseNeuronDetail(enPage, 4007, 'en');
    expect(data.name).toBe('Blue-Eyes White Dragon');
    expect(data.ruby).toBeNull();
    expect(data.attribute).toBe('LIGHT');
    expect(data.level).toBe(8);
    expect(data.atk).toBe('3000');
    expect(data.species).toBe('Dragon');
    expect(data.typeText).toBe('Normal');
    expect(data.text).toContain('This legendary dragon');
    expect(data.prints.length).toBe(77);
    expect(data.prints[0]).toMatchObject({
      cardNo:     '26DE-ENI01',
      rarityCode: 'C',
      rarityName: 'Common',
    });
  });

  test('reads the Asian-English page: AE regional prints', () => {
    const data = parseNeuronDetail(aePage, 4007, 'ae');
    expect(data.name).toBe('Blue-Eyes White Dragon');
    expect(data.attribute).toBe('LIGHT');
    expect(data.level).toBe(8);
    // Asian-English print numbers mix the AE-suffixed and the classic
    // suffix-less styles, and cover only three prints for this card.
    expect(data.prints.map(print => print.cardNo)).toEqual(['SDRB-AE001', 'LOB-001', 'SDK-001']);
    expect(data.prints[0]!.rarityName).toBe('Ultra Rare');
  });

  test('reads the German page: localized stat labels and decoded entities', () => {
    const data = parseNeuronDetail(dePage, 4007, 'de');
    // The site serves German names with HTML entities; they must arrive decoded.
    expect(data.name).toBe('Blauäugiger w. Drache');
    // TCG-locale pages carry the English name in a trailing span.
    expect(data.enName).toBe('Blue-Eyes White Dragon');
    expect(data.attribute).toBe('LICHT');
    // The level label is "Stufe 8" — matched by icon, not by text.
    expect(data.level).toBe(8);
    expect(data.species).toBe('Drache');
    expect(data.typeText).toBe('Normal');
    expect(data.prints.length).toBe(58);
    expect(data.prints[0]!.cardNo).toBe('26DE-DEI01');
  });
});

describe('parseNeuronDetail (card types)', () => {
  test('reads an Xyz card: rank instead of level', () => {
    const data = parseNeuronDetail(xyzPage, 9914, 'ja');
    expect(data.rank).toBe(4);
    expect(data.level).toBeNull();
    expect(data.atk).toBe('2500');
  });

  test('reads a Link card: link rating and placeholder DEF', () => {
    const data = parseNeuronDetail(linkPage, 13036, 'ja');
    // All-katakana name with an English span: the Japanese name must survive.
    expect(data.name).toBe('デコード・トーカー');
    expect(data.enName).toBe('Decode Talker');
    expect(data.linkRating).toBe(3);
    // The arrow set rides in the icon class; same encoding as the CNOCG API.
    expect(data.linkMarker).toBe('813');
    expect(data.level).toBeNull();
    expect(data.rank).toBeNull();
    expect(data.def).toBe('-');
  });

  test('reads a Pendulum card: level and pendulum scale', () => {
    const data = parseNeuronDetail(pendulumPage, 13359, 'ja');
    expect(data.name).toBe('オッドアイズ・アークペンデュラム・ドラゴン');
    expect(data.level).toBe(7);
    expect(data.pendulumScale).toBe(8);
  });

  test('reads a Spell card: the type row is kept instead of an attribute', () => {
    // Spell/trap pages carry their type in an extra-classed spec row and have
    // no attribute/level/atk rows; the row must still be captured.
    const data = parseNeuronDetail(spellPage, 14413, 'ja');
    expect(data.attribute).toBeNull();
    expect(data.level).toBeNull();
    expect(data.specItems).toEqual([{ title: '効果', value: '速攻魔法' }]);
    expect(data.text).toContain('ウィッチクラフト');
  });

  test('keeps the Note box out of the card text', () => {
    // The note box (rename/errata notice) follows the text box on the page;
    // it must land in `note` and never overwrite the card text.
    const data = parseNeuronDetail(notePage, 6199, 'en');
    expect(data.text).toContain('Place 3 counters');
    expect(data.note).toBe('Card Name updated from "Big Core" on April 07, 2017.');
  });

  test('splits rename annotations off both the name and the English span', () => {
    // Renamed cards annotate the displayed name(s); `name`/`enName` must come
    // out plain and the provenance land in `nameAnnotation`.
    const en = parseNeuronDetail(notePage, 6199, 'en');
    expect(en.name).toBe('B.E.S. Big Core');
    expect(en.nameAnnotation).toBe('Updated from: Big Core');

    const de = parseNeuronDetail(annotatedRenamePage, 6199, 'de');
    expect(de.name).toBe('B.E.S. Großer Kern');
    expect(de.nameAnnotation).toBe('Geändert von: Großer Kern');
    expect(de.enName).toBe('B.E.S. Big Core');
  });
});

describe('decodeEntities', () => {
  test('decodes named Latin-1 and typographic entities', () => {
    expect(decodeEntities('Bl&auml;ugiger Gr&uuml;&szlig;e')).toBe('Bläugiger Grüße');
    expect(decodeEntities('Informations Cartes non trouv&eacute;es')).toBe('Informations Cartes non trouvées');
    expect(decodeEntities('a &mdash; b &hellip; &laquo;c&raquo;')).toBe('a — b … «c»');
  });

  test('decodes numeric entities and leaves unknown ones alone', () => {
    expect(decodeEntities('&#10005; &#x2605;')).toBe('✕ ★');
    expect(decodeEntities('&unknownentity; &amp;')).toBe('&unknownentity; &');
  });
});

describe('no-data pages', () => {
  test('collects the localized notice of every supported locale', () => {
    expect(NEURON_NO_DATA_MARKERS.length).toBe(8);
  });

  test('detects a no-data page by its notice', () => {
    const page = '<html><body><div class="text">カード情報がありません。</div></body></html>';
    expect(isNeuronNoDataPage(page)).toBe(true);
    expect(neuronPageHasCard(page)).toBe(false);
    expect(isNeuronNoDataPage(jaPage)).toBe(false);
  });
});

describe('fetchNeuronDetail', () => {
  test('fetches the per-locale detail URL and parses the payload', async () => {
    let requestedUrl = '';
    const fetchImpl = ((input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return Promise.resolve(new Response(jaPage, { status: 200 }));
    }) as typeof fetch;

    const result = await fetchNeuronDetail(4007, 'ja', { fetchImpl });

    expect(requestedUrl).toBe(neuronDetailUrl(4007, 'ja'));
    expect(result?.url).toBe(neuronDetailUrl(4007, 'ja'));
    expect(result?.data.name).toBe('青眼の白龍');
  });

  test('reports a no-data page as a miss, not an error', async () => {
    const page = '<html><body>Card information not found.</body></html>';
    const fetchImpl = (() => Promise.resolve(new Response(page, { status: 200 }))) as typeof fetch;
    expect(fetchNeuronDetail(4007, 'en', { fetchImpl })).resolves.toBeNull();
  });

  test('treats an unrecognized cardless page as an error, not a silent miss', async () => {
    const page = '<html><body><div id="redesigned">surprise</div></body></html>';
    const fetchImpl = (() => Promise.resolve(new Response(page, { status: 200 }))) as typeof fetch;
    expect(fetchNeuronDetail(4007, 'en', { fetchImpl }))
      .rejects.toThrow('has no card data and no known no-data notice');
  });

  test('throws on HTTP failures so the crawl counts an error', async () => {
    const fetchImpl = (() => Promise.resolve(new Response('boom', { status: 503 }))) as typeof fetch;
    expect(fetchNeuronDetail(4007, 'ja', { fetchImpl })).rejects.toThrow('Neuron HTTP 503');
  });
});

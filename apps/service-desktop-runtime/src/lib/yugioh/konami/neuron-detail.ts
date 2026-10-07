import type { NeuronCardData, NeuronPrintEntry } from '#model/yugioh/schema/data/neuron';

import { KONAMI_TIMEOUT_MS, KONAMI_UA } from './common';
import { splitNameAnnotation } from './name-annotations';

/**
 * Parser for one Neuron card-detail page (`card_search.action?ope=2&cid=N`,
 * server-rendered HTML, one request per locale). The page also contains
 * related-card boxes and other sections reusing the same CSS classes, so every
 * extraction is scoped: main-card data to the `CardSet` section, prints to the
 * `update_list` section. Spec items are matched by their icon (the title text
 * is localized and cannot be matched on).
 */

const NEURON_DETAIL_BASE = 'https://www.db.yugioh-card.com/yugiohdb/card_search.action';

/** Detail-page URL for one card in one locale. */
export function neuronDetailUrl(cid: number, locale: string): string {
  return `${NEURON_DETAIL_BASE}?ope=2&cid=${cid}&request_locale=${locale}`;
}

/**
 * The site's "no card data" notice, in every wording it serves (the eight
 * distinct translations; Asian English shares the English notice). A page
 * carrying one of these instead of the CardSet section means this card has no
 * entry for the requested locale (e.g. not yet localized) — a miss, not a
 * failure.
 */
export const NEURON_NO_DATA_MARKERS = [
  'カード情報がありません。',
  '카드 정보가 없습니다.',
  'Card information not found.',
  'Informations Cartes non trouvées.',
  'Keine Karteninformationen gefunden.',
  'Informazioni sulla Carta non trovate.',
  'No hay información sobre la Carta.',
  'Não há informações sobre este Card.',
];

/** Whether the page carries the main card section at all. */
export function neuronPageHasCard(html: string): boolean {
  return html.includes('id="CardSet"');
}

/** Whether the page is the site's localized "no card data" notice. */
export function isNeuronNoDataPage(html: string): boolean {
  return NEURON_NO_DATA_MARKERS.some(marker => html.includes(marker));
}

/** HTML named entities seen in card pages; the core five, Latin-1, and common typographic ones. */
const NAMED_ENTITIES: Record<string, string> = {
  amp:    '&', lt:     '<', gt:     '>', quot:   '"', apos:   '\'',
  nbsp:   ' ', iexcl:  '¡', cent:   '¢', pound:  '£', curren: '¤', yen:    '¥', brvbar: '¦', sect:   '§',
  uml:    '¨', copy:   '©', ordf:   'ª', laquo:  '«', not:    '¬', shy:    '', reg:    '®', macr:   '¯',
  deg:    '°', plusmn: '±', sup2:   '²', sup3:   '³', acute:  '´', micro:  'µ', para:   '¶', middot: '·',
  cedil:  '¸', sup1:   '¹', ordm:   'º', raquo:  '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿',
  Agrave: 'À', Aacute: 'Á', Acirc:  'Â', Atilde: 'Ã', Auml:   'Ä', Aring:  'Å', AElig:  'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc:  'Ê', Euml:   'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc:  'Î', Iuml:   'Ï',
  ETH:    'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc:  'Ô', Otilde: 'Õ', Ouml:   'Ö', times:  '×',
  Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc:  'Û', Uuml:   'Ü', Yacute: 'Ý', THORN:  'Þ', szlig:  'ß',
  agrave: 'à', aacute: 'á', acirc:  'â', atilde: 'ã', auml:   'ä', aring:  'å', aelig:  'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc:  'ê', euml:   'ë', igrave: 'ì', iacute: 'í', icirc:  'î', iuml:   'ï',
  eth:    'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc:  'ô', otilde: 'õ', ouml:   'ö', divide: '÷',
  oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc:  'û', uuml:   'ü', yacute: 'ý', thorn:  'þ', yuml:   'ÿ',
  mdash:  '—', ndash:  '–', hellip: '…', lsquo:  '‘', rsquo:  '’', ldquo:  '“', rdquo:  '”', bull:   '•',
  dagger: '†', Dagger: '‡', permil: '‰', lsaquo: '‹', rsaquo: '›', trade:  '™', euro:   '€', minus:  '−',
  larr:   '←', uarr:   '↑', rarr:   '→', darr:   '↓', harr:   '↔', spades: '♠', clubs:  '♣', hearts: '♥', diams:  '♦',
};

/** Resolves named and numeric HTML entities to their characters. */
export function decodeEntities(fragment: string): string {
  return fragment.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** Strips tags and collapses whitespace/entities of one fragment. */
function text(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n'),
  )
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function textOne(fragment: string): string {
  return text(fragment).replace(/\n/g, ' ').trim();
}

/** Main-card region: from the CardSet container to the related-card section. */
function mainSection(html: string): string {
  const cardSet = html.search(/id="CardSet"/);
  const relation = html.search(/id="CardRelation"/);
  const popSet = html.search(/id="pop_set"/);
  if (cardSet === -1) throw new Error('Neuron page has no CardSet section');
  const bounds = [relation, popSet].filter(at => at !== -1);
  const end = bounds.length > 0 ? Math.min(...bounds) : -1;
  return html.slice(cardSet, end === -1 ? undefined : end);
}

/** Prints region: the update_list section of the print popup. */
function printsSection(html: string): string {
  const start = html.search(/id="update_list"/);
  if (start === -1) return '';
  const end = html.slice(start).search(/id="relationCard"/);
  return end === -1 ? html.slice(start) : html.slice(start, start + end);
}

/**
 * Spec rows carry extra classes beyond the icon-bearing `item_box` (spell and
 * trap cards use `item_box t_center` for their type row), so the class must be
 * matched loosely — but `item_box_value` must not be picked up as a row start.
 */
const SPEC_ITEM_RE = /class="item_box(?: [^"]*)?"[\s\S]*?item_box_title[^>]*>([\s\S]*?)<\/span>\s*<span class="item_box_value"[^>]*>([\s\S]*?)<\/span>/g;

interface SpecItem {
  /** Raw title region (carries the icon markup that identifies the item). */
  rawTitle: string;
  /** Plain-text label, empty when the title is only an icon. */
  title:    string;
  /** Plain-text value. */
  value:    string;
}

function parseSpecItems(main: string): SpecItem[] {
  // Spec rows all live before the language switcher, which repeats the same
  // classes with list-shaped values; cutting there keeps the scan unambiguous.
  const languageAt = main.indexOf('CardLanguage');
  const region = languageAt === -1 ? main : main.slice(0, languageAt);
  const items: SpecItem[] = [];
  for (const m of region.matchAll(SPEC_ITEM_RE)) {
    const rawTitle = m[1];
    const title = textOne(rawTitle);
    const value = textOne(m[2]);
    if (value) items.push({ rawTitle, title, value });
  }
  return items;
}

/** Value of the spec item whose icon matches, or null when the card has none. */
function iconItemValue(items: SpecItem[], iconPattern: RegExp): string | null {
  const item = items.find(item => iconPattern.test(item.rawTitle));
  return item ? item.value : null;
}

/** Trailing integer of a spec value ("レベル 8", "Level 8", "リンク 3"). */
function trailingInt(value: string | null): number | null {
  if (!value) return null;
  const m = /(\d+)\s*$/.exec(value);
  return m ? Number(m[1]) : null;
}

/**
 * Parses one detail page's main-card data for the requested locale. Throws
 * when the page carries no main card at all; callers must have ruled out the
 * no-data notice first (see `fetchNeuronDetail`).
 */
export function parseNeuronDetail(html: string, cid: number, locale: string): NeuronCardData {
  const main = mainSection(html);

  // Card name: the desktop h1 has a fixed three-part structure — an optional
  // ruby span (reading), the name as a bare text node, and an optional
  // trailing English span. Each part is captured by position; matching the
  // name by value is ambiguous for all-katakana names whose reading equals
  // the name itself. Renamed cards append a "(Updated from: ...)" annotation
  // to the displayed name (both here and in the English span); it is split
  // off so `name` stays the plain card name.
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(main)?.[1] ?? '';
  const h1Parts = /^\s*(?:<span class="ruby">([\s\S]*?)<\/span>\s*)?([\s\S]*?)\s*(?:<span>([\s\S]*?)<\/span>)?\s*$/.exec(h1);
  const ruby = textOne(h1Parts?.[1] ?? '') || null;
  const { name, annotation: nameAnnotation } = splitNameAnnotation(textOne(h1Parts?.[2] ?? ''));
  const enNameRaw = textOne(h1Parts?.[3] ?? '') || null;
  const enName = enNameRaw === null ? null : splitNameAnnotation(enNameRaw).name;
  if (!name) throw new Error(`Neuron page for cid=${cid} has no card name`);

  // Spec items, matched by icon: the label text is localized.
  const specItems = parseSpecItems(main);
  const attribute = iconItemValue(specItems, /attribute_icon/);
  const level = trailingInt(iconItemValue(specItems, /icon_level/));
  const rank = trailingInt(iconItemValue(specItems, /icon_rank/));
  const linkItem = specItems.find(item => /icon_img_set\s+link/i.test(item.rawTitle));
  const linkRating = trailingInt(linkItem?.value ?? null);
  // The arrow set rides in the icon's class ("icon_img_set link813").
  const linkMarker = linkItem ? /icon_img_set\s+link(\d+)/i.exec(linkItem.rawTitle)?.[1] ?? null : null;
  const pendulumScale = trailingInt(iconItemValue(specItems, /icon_pendulum/));
  const atk = specItems.find(item => item.title === 'ATK')?.value ?? null;
  const def = specItems.find(item => item.title === 'DEF')?.value ?? null;

  // Species + card-type line: "ドラゴン族 ／ 通常" / "Dragon / Normal".
  const speciesLine = /<p class="species">([\s\S]*?)<\/p>/.exec(main)?.[1];
  const speciesParts = speciesLine ? text(speciesLine).split('\n').filter(part => part !== '／' && part !== '/') : [];

  // Texts: each CardText box carries a variant class — plain (card text),
  // `pen` (pendulum effect), or `note` (rename/errata notice). The note box
  // follows the text box and must not be mistaken for the card text.
  let cardText: string | null = null;
  let pendulumText: string | null = null;
  let note: string | null = null;
  for (const m of main.matchAll(/class="CardText([^"]*)"[^>]*>\s*<div class="item_box_text"[^>]*>\s*(?:<div class="text_title"[^>]*>[\s\S]*?<\/div>\s*)?<div class="text_linebreak"[^>]*>([\s\S]*?)<\/div>/g)) {
    const variant = m[1] ?? '';
    const body = m[2];
    if (!body) continue;
    if (/\bnote\b/.test(variant)) note = text(body);
    else if (/\bpen\b/.test(variant)) pendulumText = text(body);
    else cardText = text(body);
  }

  const imageIds = [...main.matchAll(/thumbnail_card_image_(\d+)/g)]
    .map(m => Number(m[1]))
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort((a, b) => a - b);

  return {
    cid,
    locale,
    name,
    nameAnnotation: nameAnnotation ?? null,
    ruby:      ruby || null,
    enName,
    attribute,
    level,
    rank,
    linkRating,
    linkMarker,
    pendulumScale,
    atk,
    def,
    species:   speciesParts[0] ?? null,
    typeText:  speciesParts.slice(1).join('/') || null,
    text:      cardText,
    pendulumText,
    note,
    specItems: specItems.map(item => ({ title: item.title, value: item.value })),
    imageIds,
    prints:    parsePrints(printsSection(html)),
  };
}

/** Splits the print list into t_row entries and parses each chunk on its own. */
function parsePrints(section: string): NeuronPrintEntry[] {
  const prints: NeuronPrintEntry[] = [];
  const chunks = section.split('<div class="t_row');
  for (const chunk of chunks.slice(1)) {
    const date = /<div class="time">([\s\S]*?)<\/div>/.exec(chunk)?.[1];
    if (!date) continue;
    const number = /class="card_number">([\s\S]*?)<\/div>/.exec(chunk)?.[1];
    const packName = /pack_name[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1];
    if (!packName) continue;
    // The pid is followed by more query params (&rp=...), so the digits are
    // terminated by the next non-digit, not by a quote.
    const packId = /link_value" value="[^"]*pid=(\d+)/.exec(chunk)?.[1] ?? null;
    const rarityCode = /lr_icon[^>]*>\s*<p>([\s\S]*?)<\/p>/.exec(chunk)?.[1];
    const rarityName = /lr_icon[^>]*>\s*<p>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/.exec(chunk)?.[1];
    prints.push({
      releaseDate: textOne(date),
      cardNo:      number ? textOne(number) || null : null,
      packName:    textOne(packName),
      packId,
      rarityCode:  rarityCode ? textOne(rarityCode) || null : null,
      rarityName:  rarityName ? textOne(rarityName) || null : null,
    });
  }
  return prints;
}

/**
 * Fetches one detail page and parses it. Returns null when the locale has no
 * entry for the card (the site's no-data notice); throws on HTTP failures and
 * on pages that carry neither a card nor a known notice (a structural change
 * that must surface as an error, not as silent misses).
 */
export async function fetchNeuronDetail(
  cid: number,
  locale: string,
  { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): Promise<{ url: string, data: NeuronCardData } | null> {
  const url = neuronDetailUrl(cid, locale);
  const res = await fetchImpl(url, {
    headers:  { 'User-Agent': KONAMI_UA },
    redirect: 'follow',
    signal:   AbortSignal.timeout(KONAMI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Neuron HTTP ${res.status} for cid=${cid} locale=${locale}`);
  const html = await res.text();
  if (!neuronPageHasCard(html)) {
    if (isNeuronNoDataPage(html)) return null;
    throw new Error(`Neuron page for cid=${cid} locale=${locale} has no card data and no known no-data notice`);
  }
  return { url, data: parseNeuronDetail(html, cid, locale) };
}

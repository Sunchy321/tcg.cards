import type { Locale } from '#model/hearthstone/schema/basic';

/** Names one static card-data predicate exposed through localized raw terms. */
export type HearthstoneRawCardTerm
  = | 'golden'
    | 'diamond'
    | 'signature'
    | 'whelp'
    | 'imp'
    | 'rune-blood'
    | 'rune-frost'
    | 'rune-unholy';

/** Lists the card-data predicates that localized raw terms can select. */
export const hearthstoneRawCardTerms: readonly HearthstoneRawCardTerm[] = [
  'golden',
  'diamond',
  'signature',
  'whelp',
  'imp',
  'rune-blood',
  'rune-frost',
  'rune-unholy',
];

/** Marks localized card terms whose special predicate also searches card text. */
export function hasHearthstoneRawCardTermTextFallback(term: HearthstoneRawCardTerm): boolean {
  switch (term) {
  case 'whelp':
  case 'imp':
  case 'rune-blood':
  case 'rune-frost':
  case 'rune-unholy':
    return true;
  case 'golden':
  case 'diamond':
  case 'signature':
    return false;
  }
  return false;
}

/** Holds collection-search terms from each supported locale's hsdata GLUE strings. */
const localizedTerms: Record<Locale, Record<HearthstoneRawCardTerm, string>> = {
  en: {
    'golden':      'golden',
    'diamond':     'diamond',
    'signature':   'signature',
    'whelp':       'whelp',
    'imp':         'imp',
    'rune-blood':  'blood',
    'rune-frost':  'frost',
    'rune-unholy': 'unholy',
  },
  de: {
    'golden':      'golden',
    'diamond':     'diamant',
    'signature':   'markant',
    'whelp':       'welpling',
    'imp':         'wichtel',
    'rune-blood':  'Blut',
    'rune-frost':  'Frost',
    'rune-unholy': 'Unheilig',
  },
  es: {
    'golden':      'doradas',
    'diamond':     'diamante',
    'signature':   'distintiva',
    'whelp':       'cría',
    'imp':         'diablillo',
    'rune-blood':  'sangre',
    'rune-frost':  'escarcha',
    'rune-unholy': 'profana',
  },
  fr: {
    'golden':      'dorées',
    'diamond':     'diamant',
    'signature':   'signature',
    'whelp':       'dragonnet',
    'imp':         'diablotin',
    'rune-blood':  'sang',
    'rune-frost':  'givre',
    'rune-unholy': 'impie',
  },
  it: {
    'golden':      'dorata',
    'diamond':     'diamante',
    'signature':   'pregiata',
    'whelp':       'draghetto',
    'imp':         'imp',
    'rune-blood':  'sangue',
    'rune-frost':  'gelo',
    'rune-unholy': 'empietà',
  },
  ja: {
    'golden':      'ゴールデン',
    'diamond':     'ダイヤモンド',
    'signature':   'シグネチャー',
    'whelp':       'チビドラゴン',
    'imp':         'インプ',
    'rune-blood':  '血',
    'rune-frost':  '凍気',
    'rune-unholy': '不浄',
  },
  ko: {
    'golden':      '황금',
    'diamond':     '다이아',
    'signature':   '간판',
    'whelp':       '새끼용',
    'imp':         '임프',
    'rune-blood':  '혈기',
    'rune-frost':  '냉기',
    'rune-unholy': '부정',
  },
  mx: {
    'golden':      'dorada',
    'diamond':     'diamante',
    'signature':   'insignia',
    'whelp':       'cría',
    'imp':         'diablillo',
    'rune-blood':  'sangre',
    'rune-frost':  'escarcha',
    'rune-unholy': 'profana',
  },
  pl: {
    'golden':      'złote',
    'diamond':     'diamentowa',
    'signature':   'specjalne',
    'whelp':       'pisklę',
    'imp':         'chochlik',
    'rune-blood':  'krew',
    'rune-frost':  'lód',
    'rune-unholy': 'przekleństwo',
  },
  pt: {
    'golden':      'dourado',
    'diamond':     'diamante',
    'signature':   'exclusivo',
    'whelp':       'dragonete',
    'imp':         'diabrete',
    'rune-blood':  'sangue',
    'rune-frost':  'gelo',
    'rune-unholy': 'profano',
  },
  ru: {
    'golden':      'золотые',
    'diamond':     'алмазные',
    'signature':   'особые',
    'whelp':       'дракончик',
    'imp':         'бес',
    'rune-blood':  'кровь',
    'rune-frost':  'лед',
    'rune-unholy': 'нечестивость',
  },
  th: {
    'golden':      'สีทอง',
    'diamond':     'ขอบเพชร',
    'signature':   'ซิกเนเจอร์',
    'whelp':       'ลูกมังกร',
    'imp':         'อิมพ์',
    'rune-blood':  'เลือด',
    'rune-frost':  'น้ำแข็ง',
    'rune-unholy': 'เสื่อมทราม',
  },
  zhs: {
    'golden':      '金卡',
    'diamond':     '钻石',
    'signature':   '异画',
    'whelp':       '雏龙',
    'imp':         '小鬼',
    'rune-blood':  '鲜血',
    'rune-frost':  '冰霜',
    'rune-unholy': '邪恶',
  },
  zht: {
    'golden':      '金卡',
    'diamond':     '鑽石',
    'signature':   '珍藏',
    'whelp':       '幼龍',
    'imp':         '小鬼',
    'rune-blood':  '血魄',
    'rune-frost':  '冰霜',
    'rune-unholy': '穢邪',
  },
};

/** Resolves one exact localized term to its card-data predicate. */
export function resolveHearthstoneRawCardTerm(
  value: string,
  lang: Locale,
): HearthstoneRawCardTerm | undefined {
  const normalized = value.toLowerCase();
  return hearthstoneRawCardTerms.find(term => localizedTerms[lang][term].toLowerCase() === normalized);
}

// import type { LocaleMessageValue } from 'vue-i18n';

// import { GAMES } from '#shared';

// const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

import omni from './omni';
import magic from './magic';
import hearthstone from './hearthstone';

export default {
  lang: {
    '$self': 'English',

    'en':  'English',
    'de':  'German',
    'es':  'Spanish',
    'fr':  'French',
    'it':  'Italian',
    'ja':  'Japanese',
    'ko':  'Korean',
    'mx':  'Mexican Spanish',
    'pl':  'Polish',
    'pt':  'Portuguese',
    'ru':  'Russian',
    'th':  'Thai',
    'zhs': 'Simplified Chinese',
    'zht': 'Traditional Chinese',
    'he':  'Hebrew',
    'la':  'Latin',
    'grc': 'Ancient Greek',
    'ar':  'Arabic',
    'sa':  'Sanskrit',
    'ph':  'Phyrexian',

    'en:asia': 'English (Asia)',
    'zhs:pro': 'Simplified Chinese (YGOPro)',
    'zhs:nw':  'Simplified Chinese (NW)',
    'zhs:cn':  'Simplified Chinese (CNOCG)',
    'zhs:md':  'Simplified Chinese (Master Duel)',
  },

  search: {
    error: {
      'unknown-token':   'unknown token',
      'unknown-command': 'unknown command {name}',
    },

    separator: {
      '&': 'and',
      '|': 'or',
    },

    operator: {
      'match':            ' matches ',
      'not-match':        ' doesn\'t match',
      'equal':            ' is equal to ',
      'not-equal':        ' isn\'t equal to ',
      'less-than':        ' is less than',
      'less-or-equal':    ' is less than or equal to ',
      'greater-than':     ' is greater than',
      'greater-or-equal': ' is greater than or equal to ',

      'include':     ' includes ',
      'not-include': ' doesn\'t include ',
      'is':          ' is ',
      'is-not':      ' isn\'t ',

      'count-is':               ' count is ',
      'count-is-not':           ' count isn\'t ',
      'count-greater-than':     ' count is greater than ',
      'count-greater-or-equal': ' count is greater than or equal to ',
      'count-less-than':        ' count is less than ',
      'count-less-or-equal':    ' count is less than or equal to ',

      'fully-match':     ' fully matches',
      'not-fully-match': ' doesn\'t fully match',
    },

    qualifier: {
      '!': 'not',
    },
  },

  // omnisearch: gameI18n['./omnisearch/index.ts'],

  // ...Object.fromEntries(GAMES.map(g => [g, gameI18n[`./${g}/index.ts`]])),

  omni,
  magic,
  hearthstone,
};

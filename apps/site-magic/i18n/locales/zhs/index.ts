// import type { LocaleMessageValue } from 'vue-i18n';

// import { GAMES } from '#shared';

// const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

import omni from './omni';
import magic from './magic';
import hearthstone from './hearthstone';

export default {
  lang: {
    '$self': '简体中文',

    'en':  '英语',
    'de':  '德语',
    'es':  '西班牙语',
    'fr':  '法语',
    'it':  '意大利语',
    'ja':  '日语',
    'ko':  '韩语',
    'mx':  '墨西哥语',
    'pl':  '波兰语',
    'pt':  '葡萄牙语',
    'ru':  '俄语',
    'th':  '泰语',
    'zhs': '简体中文',
    'zht': '繁体中文',
    'he':  '希伯来语',
    'la':  '拉丁语',
    'grc': '古希腊语',
    'ar':  '阿拉伯语',
    'sa':  '梵文',
    'ph':  '非瑞克西亚文',

    'en:asia': '英文（亚洲）',
    'zhs:pro': '简体中文（YGOPro)',
    'zhs:nw':  '简体中文（NW）',
    'zhs:cn':  '简体中文（CN）',
    'zhs:md':  '简体中文（MD）',
  },

  search: {
    error: {
      'unknown-token':   '未知符号',
      'unknown-command': '未知命令{name}',
    },

    separator: {
      '&': '且',
      '|': '或',
    },

    operator: {
      'match':            '匹配',
      'not-match':        '不匹配',
      'equal':            '等于',
      'not-equal':        '不等于',
      'less-than':        '小于',
      'less-or-equal':    '等于或小于',
      'greater-than':     '大于',
      'greater-or-equal': '等于或大于',

      'include':     '包含',
      'not-include': '不包含',
      'is':          '是',
      'is-not':      '不是',

      'count-is':               '数量是',
      'count-is-not':           '数量不是',
      'count-greater-than':     '数量大于',
      'count-greater-or-equal': '数量等于或大于',
      'count-less-than':        '数量小于',
      'count-less-or-equal':    '数量等于或小于',
    },

    qualifier: {
      '!': '并非',
    },
  },

  // omnisearch: gameI18n['./omnisearch/index.ts'],

  // ...Object.fromEntries(GAMES.map(g => [g, gameI18n[`./${g}/index.ts`]])),

  omni,
  magic,
  hearthstone,
};

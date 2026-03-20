// import type { LocaleMessageValue } from 'vue-i18n';

// import { GAMES } from '#shared';

// const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

// import omni from './omni';
// import magic from './magic';
// import hearthstone from './hearthstone';

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

  settings: {
    $self:       '设置',
    account:     '账户',
    notLoggedIn: '尚未登录。',

    login:              '登录',
    loginFailed:        '登录失败',
    loginSuccess:       '登录成功',
    loginRequired:      '请登录后再访问账户设置。',
    logout:             '退出登录',
    logoutSuccess:      '已退出登录',
    register:           '注册',
    registerFailed:     '注册失败',
    registerSuccess:    '账户创建成功',
    createAccount:      '创建账户',
    alreadyHaveAccount: '已有账户？',

    profile:     '个人资料',
    displayName: '显示名称',
    email:       '邮箱',
    password:    '密码',

    emailPlaceholder:       '你的邮箱地址',
    passwordPlaceholder:    '输入密码',
    namePlaceholder:        '你的名字',
    newPasswordPlaceholder: '至少 8 个字符',

    changePassword:  '修改密码',
    currentPassword: '当前密码',
    newPassword:     '新密码',
    passwordUpdated: '密码修改成功',

    save:          '保存',
    updateSuccess: '更新成功',
    updateFailed:  '更新失败',

    dangerZone: '危险操作',

    role: {
      owner:     '站长',
      admin:     '管理员',
      gameAdmin: '游戏管理员',
      user:      '普通用户',
    },

    general: {
      $self:      '通用',
      uiLanguage: '界面语言',
    },

    game: {
      $self:    '游戏',
      language: '游戏语言',
    },
  },

  hearthstone: {
    $self: '炉石传说',
    $full: '炉石传说',

    card: {
      $self: '卡牌',
    },

    set: {
      $self: '系列',
    },

    format: {
      $self: '赛制',
    },

    patch: {
      $self: '版本',
    },
  },

  // omni,
  // magic,
  // hearthstone,
};

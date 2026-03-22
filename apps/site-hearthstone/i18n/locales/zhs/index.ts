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
      $self:     '卡牌',
      versions:  '版本历史',
      notFound:  '找不到卡牌',
      tagCopied: '标签已复制',

      variant: {
        normal:        '普通',
        golden:        '金卡',
        diamond:       '钻石',
        signature:     '异画',
        battlegrounds: '酒馆战棋',
      },

      type: {
        null:                   '未知',
        game:                   '游戏',
        player:                 '玩家',
        hero:                   '英雄',
        minion:                 '随从',
        spell:                  '法术',
        enchantment:            '光环',
        weapon:                 '武器',
        item:                   '物品',
        token:                  '衍生物',
        hero_power:             '英雄技能',
        blank:                  '空白',
        game_mode_button:       '游戏模式按钮',
        move_minion_hover_target: '移动随从悬停目标',
        mercenary_ability:      '雇佣兵技能',
        buddy_meter:            '伙伴计量条',
        location:               '地点',
        quest_reward:           '任务奖励',
        tavern_spell:           '酒馆法术',
        anomaly:                '异常',
        trinket:                '饰品',
        pet:                    '宠物',
      },

      race: {
        bloodelf:  '血精灵',
        draenei:   '德莱尼',
        dwarf:     '矮人',
        gnome:     '地精',
        goblin:    '哥布林',
        human:     '人类',
        nightelf:  '暗夜精灵',
        orc:       '兽人',
        tauren:    '牛头人',
        troll:     '巨魔',
        undead:    '亡灵',
        worgen:    '狼人',
        goblin2:   '哥布林',
        murloc:    '鱼人',
        demon:     '恶魔',
        scourge:   '天灾',
        mech:      '机械',
        elemental: '元素',
        ogre:      '食人魔',
        beast:     '野兽',
        totem:     '图腾',
        nerubian:  '地穴魔虫',
        pirate:    '海盗',
        dragon:    '龙',
        blank:     '无',
        all:       '全部',
        egg:       '蛋',
        quilboar:  '野猪人',
        centaur:   '半人马',
        furbolg:   '费伍尔格',
        highelf:   '高等精灵',
        treant:    '树人',
        halforc:   '半兽人',
        lock:      '锁链',
        naga:      '纳迦',
        old_god:   '上古之神',
        pandaren:  '熊猫人',
        gronn:     '格龙',
        celestial: '天神',
        gnoll:     '诺尔',
        golem:     '魔像',
        vulpera:   '狐人',
      },

      spellSchool: {
        arcane:           '奥术',
        fire:             '火焰',
        frost:            '冰霜',
        nature:           '自然',
        holy:             '神圣',
        shadow:           '暗影',
        fel:              '邪能',
        physical_combat:  '物理攻击',
        tavern_spell:     '酒馆法术',
        spellcraft:       '法术工艺',
        lesser_trinket:   '次级饰品',
        greater_trinket:  '高级饰品',
        upgrade:          '升级',
      },
    },

    tag: {},

    legality: {
      legal:       '合法',
      banned:      '禁止',
      restricted:  '限制',
      wild:        '狂野',
      unavailable: '不可用',
    },

    set: {
      $self: '系列',
    },

    format: {
      $self:         '赛制',
      standard:      '标准',
      wild:          '狂野',
      twist:         '扭曲',
      classic:       '经典',
      battlegrounds: '酒馆战棋',
      mercenaries:   '雇佣兵',
      arena:         '竞技场',
      duel:          '决斗',
      tavern_brawl:  '乱斗',
      adventure:     '冒险',
    },

    patch: {
      $self: '补丁',
    },
  },

  // omni,
  // magic,
  // hearthstone,
};

import { LocaleMessageValue } from 'vue-i18n';

import { games } from '@interface/index';

const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

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

    user: {
        'username':  '用户名',
        'email':     '邮箱',
        'password':  '密码',
        'roles':     '角色',
        'createdAt': '注册日期',

        'repeat-password': '重复密码',

        'login':    '登录',
        'logout':   '退出账号',
        'register': '注册',

        'passwordHint': '至少8位，且须包含大小写字母、数字和特殊字符',
        'weakPassword': '你设置的密码太弱',

        'error': {
            'REQUIRE_USERNAME':        '需要用户名',
            'REQUIRE_EMAIL':           '需要电子邮件地址',
            'invalid-email':           '不合法的电子邮件地址',
            'REQUIRE_PASSWORD':        '需要密码',
            'WRONG_REPEATED_PASSWORD': '两次密码不相同',
        },

        'role': {
            user:  '用户',
            admin: '管理员',
            owner: '站长',
        },
    },

    setting: {
        '$self': '设置',
        'basic': '基本设置',
        'lang':  '语言',

        'api-key': {
            '$self':      'API密钥',
            'name':       '名称',
            'created-at': '创建时间',
            'delete':     '删除',
            'cancel':     '取消',

            'create-success': 'API密钥创建成功。',
            'create-hint':    'API密钥只会显示一次，请妥善保存。',
            'copied':         'API密钥已复制！',

            'delete-key':  '删除API密钥',
            'delete-hint': '确定要删除该API密钥吗？此操作无法撤销！请在文本框中重复 {name} 以确认删除',
            'deleted':     'API密钥删除成功！',
        },
    },

    ui: {
        search: '搜索',

        ai: {
            'convert-search-syntax': 'AI转换搜索语法',
            'ai-search-mode':        'AI搜索模式',
            'normal-search-mode':    '普通搜索模式',
            'chat':                  'AI 聊天',
            'select-game':           '选择游戏',
            'welcome-title':         '欢迎使用AI搜索助手',
            'welcome-intro':         '我可以帮你：',
            'feature-convert':       '将自然语言转换为搜索查询',
            'feature-recommend':     '推荐适合的卡牌',
            'feature-synergy':       '分析卡牌配合',
            'feature-deck':          '提供卡组构建建议',
            'input-placeholder':     '输入你的问题或搜索需求...',
            'clear-chat':            '清空对话',
            'search-syntax':         '搜索语法',
            'execute-search':        '执行搜索',
            'error-message':         '抱歉，我遇到了一些问题。请稍后再试。',
            'quick-action':          {
                magic: {
                    'blue-instant':   '蓝色快速咒语',
                    'blue-instant-q': '推荐一些强力的蓝色快速咒语',
                    'removal':        '费用2-3的去除',
                    'removal-q':      '找一些费用2-3的去除咒语',
                    'commander':      '指挥官推荐',
                    'commander-q':    '推荐适合新手的指挥官',
                },
                yugioh: {
                    'lv4-dark':   '4星暗属性',
                    'lv4-dark-q': '推荐强力的4星暗属性怪兽',
                    'removal':    '破坏魔陷',
                    'removal-q':  '找能破坏魔法陷阱的卡',
                    'handtrap':   '手坑推荐',
                    'handtrap-q': '推荐常用的手坑卡',
                },
                hearthstone: {
                    'mage-spell':   '法师法术',
                    'mage-spell-q': '推荐强力的法师法术',
                    'minion-3':     '3费随从',
                    'minion-3-q':   '找一些3费的优质随从',
                    'draw':         '抽牌机制',
                    'draw-q':       '推荐能抽牌的卡',
                },
            },
        },
    },

    common: {
        add:    '添加',
        edit:   '编辑',
        delete: '删除',
        save:   '保存',
        cancel: '取消',
        back:   '返回',
        close:  '关闭',
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

    omnisearch: gameI18n['./omnisearch/index.ts'],

    ...Object.fromEntries(games.map(g => [g, gameI18n[`./${g}/index.ts`]])),
};

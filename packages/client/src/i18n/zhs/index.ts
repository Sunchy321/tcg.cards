import { games } from 'interface/index';

const gameI18n = import.meta.glob('./*/index.ts', { eager: true, import: 'default' });

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
        username: '用户名',
        password: '密码',
        login:    '登录',
        logout:   '退出账号',
        register: '注册',

        passwordHint: '至少8位，且须包含大小写字母、数字和特殊字符',
        weakPassword: '你设置的密码太弱',

        role: {
            normal: '普通用户',
            admin:  '管理员',
        },
    },

    setting: {
        $self: '设置',
        basic: '基本设置',
        lang:  '语言',
    },

    ui: {
        search: '搜索',
    },

    search: {
        error: {
            'unknown-token': '未知符号',
        },

        separator: {
            '&': '且',
            '|': '或',
        },

        operator: {
            'match':         '匹配',
            'not-match':     '不匹配',
            'equal':         '等于',
            'not-equal':     '不等于',
            'less-than':     '小于',
            'less-equal':    '等于或小于',
            'greater-than':  '大于',
            'greater-equal': '等于或大于',

            'include':     '包含',
            'not-include': '不包含',
            'is':          '是',
            'is-not':      '不是',
        },

        qualifier: {
            '!': '并非',
        },
    },

    integrated: gameI18n['./integrated/index.ts'],

    ...Object.fromEntries(games.map(g => [g, gameI18n[`./${g}/index.ts`]])),
};

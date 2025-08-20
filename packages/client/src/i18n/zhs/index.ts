import { games } from '@interface/index';

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

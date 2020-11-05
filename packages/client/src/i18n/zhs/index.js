import magic from './magic';
import hearthstone from './hearthstone';

export default {
    lang: {
        $self: '简体中文',

        en:  '英文',
        de:  '德文',
        fr:  '法文',
        it:  '意大利文',
        ja:  '日文',
        ko:  '韩文',
        pt:  '葡萄牙文',
        ru:  '俄文',
        es:  '西班牙文',
        zhs: '简体中文',
        zht: '繁体中文',
        he:  '希伯来文',
        la:  '拉丁文',
        grc: '古希腊文',
        ar:  '阿拉伯文',
        sa:  '梵文',
        ph:  '非瑞克西亚文',
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
        basic: '基本设置',

        lang: '语言',
    },

    data: '数据',

    magic,
    hearthstone,
};

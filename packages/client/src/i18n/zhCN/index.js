export default {
    lang: {
        $self: '简体中文',

        enUS: '英文',
        esES: '西班牙文',
        frFR: '法文',
        deDE: '德文',
        itIT: '意大利文',
        ptPT: '葡萄牙文',
        jaJP: '日文',
        koKR: '韩文',
        ruRU: '俄文',
        zhCN: '简体中文',
        zhCT: '繁体中文',
        he:   '希伯来文',
        la:   '拉丁文',
        grc:  '古希腊文',
        ar:   '阿拉伯文',
        sa:   '梵文',
        px:   '非瑞克西亚文'
    },

    game: {
        magic: '万智牌'
    },

    title: {
        default: '',

        magic: {
            format:          '赛制',
            'format-change': '赛制更动',
            set:             '系列',
            card:            '牌张'
        }
    },

    magic: {
        $self: '万智牌',

        format: {
            order:        '顺序',
            localization: '本地化',

            'localization/column': {
                lang: '语言',
                name: '名称'
            },

            standard: '标准',
            pioneer:  '先驱',
            modern:   '近代',
            extended: '扩充',
            legacy:   '薪传',
            vintage:  '特选',

            'standard/arena': 'MTGA标准',

            commander:     '指挥官',
            duelcommander: '法禁指挥官',
            commander1v1:  '指挥官1v1',
            brawl:         '争锋',

            pauper: '纯铁',

            two_head_giant: '双头巨人'
        },

        'format-change': {
            type: '类别',

            'type/option': {
                'banlist-change': '禁牌表更动'
            },

            source: '来源',

            'source/option': {
                wotc:          '威世智',
                mtgcommander:  '官禁指挥官',
                duelcommander: '法禁指挥官'
            },

            category: '分类',

            'category/option': {
                pioneer:      '先驱',
                commander1v1: '指挥官1v1'
            },

            tabletop: '桌面版',
            online:   '万智牌线上版',
            arena:    '万智牌竞技场',

            format: '赛制'
        },

        set: {
            'sync-with-scryfall': '与 Scryfall 同步',
            'sync-with-mtgjson':  '与 MTGJSON 同步',

            'scryfall-code': 'Scryfall 代码',
            'online-code':   'MO 代码',

            block:  '环境',
            parent: '父系列',

            'set-type':     '系列类别',
            'is-digital':   '数字系列',
            'is-foil-only': '仅包含闪卡',
            'release-date': '发售日期',
            'card-count':   '牌张总数',

            localization: '本地化',

            'localization/column': {
                lang:  '语言',
                name:  '名称',
                block: '环境',
                link:  '链接'
            }
        }
    }
};

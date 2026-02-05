export default {
    'setting': {
        cache: '缓存',
        clear: '清除',
    },

    'advanced-search': {
        '$self':          '高级搜索',
        'name':           '名称',
        'cost':           '法术力费用',
        'type':           '类别',
        'text':           '描述',
        'color':          '颜色',
        'color-identity': '标识色',

        'color-option': {
            'include': '包含',
            'exact':   '正好',
            'at-most': '至多',
        },

        'search': '搜索',
    },

    'search-docs': {
        $self: '搜索文档',
    },

    'card': {
        'external-link': '外部链接',

        'link-name': {
            scryfall: 'Scryfall',
            gatherer: 'Gatherer',
            mtgch:    '大学院废墟',

            card:  '卡牌',
            print: '印刷版本',
        },
    },

    'format': {
        'banlist':  '禁限牌表',
        'set':      '可用系列',
        'timeline': '时间线',
        'save_svg': '保存SVG',
        'no_data':  '暂无数据',

        'source': {
            ante:       '赌博牌',
            conspiracy: '诡局',
            legendary:  '传奇',
            offensive:  '冒犯性牌',
        },

        'sort-by': {
            name: '名称',
            date: '日期',
        },
    },

    'set': {
        booster: '补充包',
    },

    'cr': {
        'copy-text': 'CR文本已复制到剪贴板',
    },

    'misc': {
        '$self':   '杂项',
        'symbol':  '符号',
        'keyword': '关键字',

        'symbol-style': {
            normal: '普通',
            shadow: '阴影',
            flat:   '扁平',
        },

        'keyword-mode': {
            simple:  '简略模式',
            variant: '显示变种',
            full:    '全部显示',
        },

        'keyword-type': {
            keyword_ability: '关键字异能',
            keyword_action:  '关键字动作',
            ability_word:    '异能提示',
            keyword_mtga:    'MTGA关键字',
            keyword_un:      '银边关键字',
        },
    },

    'deck': {
        '$self':          '套牌',
        'decks':          '套牌',
        'create-deck':    '创建套牌',
        'edit':           '编辑',
        'name':           '套牌名称',
        'description':    '描述',
        'no-description': '未提供描述',
        'format':         '赛制',
        'visibility':     '可见性',
        'tags':           '标签',
        'cards':          '卡牌',
        'main-deck':      '主牌库',
        'sideboard':      '备牌',
        'commander':      '指挥官',
        'companion':      '伙伴',
        'category':       '分类',
        'card-id':        '卡牌ID',
        'quantity':       '数量',
        'sort-by':        '排序方式',
        'sort-order':     '排序顺序',
        'ascending':      '升序',
        'descending':     '降序',
        'updated-at':     '更新时间',
        'created-at':     '创建时间',
        'views':          '浏览',
        'likes':          '点赞',
        'favorites':      '收藏',
        'statistics':     '统计',
        'total-cards':    '总卡牌数',
        'updated':        '更新于',
        'search-card':    '搜索…',
        'no-results':     '未找到结果',
        'type-to-search': '输入以搜索卡牌',
        'view-text':      '文本列表',
        'view-image':     '卡牌图片',
        'view-code':      '代码视图',
        'group-category': '按分类',
        'group-type':     '按类型',
        'group-cost':     '按费用',
        'group-color':    '按颜色',
        'sort-name':      '按名称',
        'sort-cost':      '按费用',
        'sort-color':     '按颜色',
        'sort-type':      '按类型',
        'sort-rarity':    '按稀有度',

        'card-added': '卡牌已添加',

        'import-export':         '导入/导出',
        'deck-code':             '套牌代码',
        'deck-code-placeholder': '在此粘贴或编辑套牌代码...',
        'deck-code-format':      '格式：每行 [数量] [卡牌ID]。使用 "Commander:"、"Companion:"、"Deck:"、"Sideboard:" 来分隔区域。',
        'export-code':           '导出',
        'import-code':           '导入',
        'apply-code':            '应用修改',
        'reset-code':            '重置',
        'import-success':        '套牌代码导入成功',
        'import-error':          '导入套牌代码失败',

        'check-legality':                '检查合法性',
        'legality-check':                '合法性检查',
        'legal':                         '合法',
        'not-legal':                     '不合法',
        'issues':                        '问题',
        'issues-count':                  '发现 {count} 个问题',
        'issue-banned':                  '该卡牌被禁',
        'issue-restricted':              '限制为 {limit} 张，但您有 {current} 张',
        'issue-not-legal':               '该卡牌在此赛制中不合法',
        'issue-too-many':                '限制为 {limit} 张，但您有 {current} 张',
        'issue-invalid-deck-size':       '主牌库需要 {limit} 张牌，但现有 {current} 张',
        'issue-invalid-commander-count': '需要 {limit} 个指挥官，但现有 {current} 个',
        'legality-check-error':          '检查合法性失败',

        'no-decks':         '未找到套牌',
        'no-deck':          '套牌不存在',
        'no-cards':         '此分类中没有卡牌',
        'deck-not-found':   '套牌不存在',
        'name-required':    '套牌名称必填',
        'format-required':  '赛制必选',
        'card-id-required': '卡牌ID必填',
        'confirm-delete':   '确认删除',
        'delete-warning':   '确定要删除此套牌吗？此操作无法撤销。',
        'create-success':   '套牌创建成功',
        'update-success':   '套牌更新成功',
        'delete-success':   '套牌删除成功',
        'load-error':       '加载套牌失败',
        'create-error':     '创建套牌失败',
        'update-error':     '更新套牌失败',
        'delete-error':     '删除套牌失败',
        'like-error':       '点赞操作失败',
        'favorite-error':   '收藏操作失败',

        'visibility-public':        '公开',
        'visibility-unlisted':      '未列出',
        'visibility-private':       '私密',
        'visibility-public-desc':   '所有人都可以看到此套牌',
        'visibility-unlisted-desc': '只有拥有链接的人可以看到此套牌',
        'visibility-private-desc':  '只有你可以看到此套牌',
    },
};

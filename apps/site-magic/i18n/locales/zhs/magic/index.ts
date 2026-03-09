import search from './search';

export default {
  $self: '万智牌',
  $full: '万智牌',

  format: {
    '$self': '赛制',

    'standard': '标准',
    'pioneer':  '先驱',
    'modern':   '近代',
    'extended': '扩充',
    'legacy':   '薪传',
    'vintage':  '特选',

    'alchemy':  '炼金',
    'historic': '史迹',
    'explorer': '先驱（MTGA）',
    'timeless': '不朽',

    'standard/arena': 'MTGA标准',

    'commander':           '指挥官',
    'duelcommander':       '法禁指挥官',
    'duelcommander_docfx': '法禁指挥官（DocFX分叉）',
    'leviathan_commander': '海怪禁指挥官',
    'commander1v1':        '指挥官1v1',
    'brawl':               '争锋',
    'standard_brawl':      '标准争锋',

    'pauper':               '纯普',
    'oathbreaker':          '破誓人',
    'penny':                'Penny Dreadful',
    'canadian_highlander':  'Canadian Highlander',
    'pauper_commander':     '纯普指挥官',
    'pauper_duelcommander': '纯普指挥官1v1',

    'two_head_giant': '双头巨人',
  },

  rarity: {
    $self: '稀有度',

    common:   '普通',
    uncommon: '非普通',
    rare:     '稀有',
    mythic:   '秘稀',
    special:  '特殊',
  },

  legality: {
    $self: '可用性',

    legal:               '可用',
    banned:              '禁止',
    banned_in_bo1:       '在BO1中禁止',
    suspended:           '暂缓',
    restricted:          '限制',
    unavailable:         '不可用',
    banned_as_commander: '禁止用作指挥官',
    banned_as_companion: '禁止用作行侣',
    game_changer:        '主宰牌',
    score:               '{n}分',
  },

  tag: {
    'reserved':        '不重印',
    'full-art':        '全画',
    'oversized':       '大尺寸',
    'story-spotlight': '故事焦点',
    'textless':        '无文字',
  },

  ui: {
    format: {
      banlist:  '禁限表',
      set:      '系列',
      no_data:  '无数据',
      save_svg: '保存 SVG',

      group: {
        ante:       '赌注牌',
        legendary:  '传奇',
        conspiracy: '诡局',
        unfinity:   '鸡飞牌',
        offensive:  '冒犯性牌',
      },
    },
  },

  rule: {
    '$self':       '综合规则',
    'diff':        '规则差异',
    'history':     '规则历史',
    'show-minor':  '显示次要更改',
    'copy-text':   '规则文本已复制',
  },

  search,
};

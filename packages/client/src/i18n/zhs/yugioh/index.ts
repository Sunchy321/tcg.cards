import search from './search';
import ui from './ui';

export default {
    $self: '游戏王',

    card: {
        '$self': '卡牌',

        'text-mode': {
            unified: '统一描述',
            printed: '牌面描述',
        },
    },

    set: {
        $self: '系列',
    },

    format: {
        $self: '赛制',

        ocg:   'OCG',
        tcg:   'TCG',
        cnocg: '简中OCG',
        goat:  'GOAT',
    },

    legality: {
        '$self': '可用性',

        'unlimited':    '无限制',
        'semi-limited': '准限制',
        'limited':      '限制',
        'forbidden':    '禁止',
        'unavailable':  '不可用',
    },

    ui,
    search,
};

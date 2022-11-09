import card from './card';
import ui from './ui';

export default {
    $self: '炉石传说',

    format: {
        $self: '模式',

        standard:      '标准',
        wild:          '狂野',
        classic:       '经典',
        battlegrounds: '酒馆战棋',
        mercenaries:   '佣兵',
        arena:         '竞技',
        duel:          '对决',
        tavern_brawl:  '乱斗',
        adventure:     '冒险',
    },

    legality: {
        banned:              '禁用',
        legal:               '可用',
        banned_in_deck:      '构筑禁用',
        banned_in_card_pool: '卡池禁用',
        unavailable:         '不可用',
    },

    adjustment: {
        nerf:   '削弱',
        buff:   '加强',
        adjust: '调整',
    },

    card,
    ui,
};

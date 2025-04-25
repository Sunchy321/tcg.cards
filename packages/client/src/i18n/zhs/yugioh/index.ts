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

    ui,
    search,
};

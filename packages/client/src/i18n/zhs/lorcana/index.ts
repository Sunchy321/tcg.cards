import search from './search';
import ui from './ui';

export default {
    $self: '洛卡纳',

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

        core: '核心构组赛',
    },

    ui,
    search,
};

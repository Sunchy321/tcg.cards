import search from './search';
import ui from './ui';

import format from '@model/lorcana/i18n/zhs/format.yml';

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

    format: { $self: '赛制', ...format },

    legality: {
        $self: '可用性',

        legal:       '可用',
        banned:      '禁止',
        unavailable: '不可用',
    },

    ui,
    search,
};

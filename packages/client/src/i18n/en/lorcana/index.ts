import search from './search';
import ui from './ui';

import format from '@model/lorcana/i18n/en/format.yml';

export default {
    $self: 'Lorcana',

    card: {
        '$self': 'Card',

        'text-mode': {
            unified: 'Unified',
            printed: 'Printed',
        },
    },

    set: {
        $self: 'Set',
    },

    format: { $self: 'Format', ...format },

    legality: {
        $self: 'Legality',

        legal:       'Legal',
        banned:      'Banned',
        unavailable: 'Unavailable',
    },

    ui,
    search,
};

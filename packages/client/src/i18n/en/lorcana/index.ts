import search from './search';
import ui from './ui';

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

    format: {
        $self: 'Format',

        core: 'Core Constructed',
    },

    legality: {
        $self: 'Legality',

        legal:       'Legal',
        banned:      'Banned',
        unavailable: 'Unavailable',
    },

    ui,
    search,
};

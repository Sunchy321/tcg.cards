import search from './search';
import ui from './ui';

export default {
    $self: 'PTCG',

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

        standard:  'Standard',
        expanded:  'Expanded',
        unlimited: 'Unlimited',
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

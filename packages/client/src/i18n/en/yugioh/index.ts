import search from './search';
import ui from './ui';

export default {
    $self: 'Yu-Gi-Oh!',

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

        ocg:   'OCG',
        tcg:   'TCG',
        cnocg: 'CNOCG',
        goat:  'GOAT',
    },

    legality: {
        '$self': 'Legality',

        'unlimited':    'Unlimited',
        'semi-limited': 'Semi-Limited',
        'limited':      'Limited',
        'forbidden':    'Forbidden',
        'unavailable':  'Unavailable',
    },

    ui,
    search,
};

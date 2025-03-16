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

    ui,
    search,
};

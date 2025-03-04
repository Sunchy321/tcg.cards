import card from './card';
import ui from './ui';
import tag from './tag';
import search from './search';

export default {
    $self: 'Hearthstone',

    format: {
        $self: 'Mode',

        standard:      'Standard',
        wild:          'Wild',
        twist:         'Twist',
        classic:       'Classic',
        battlegrounds: 'Battlegrounds',
        mercenaries:   'Mercenaries',
        arena:         'Arena',
        duel:          'Duel',
        tavern_brawl:  'Tavern Brawl',
        adventure:     'Adventure',
    },

    legality: {
        banned:              'Banned',
        legal:               'Legal',
        banned_in_deck:      'Banned in Deck',
        banned_in_card_pool: 'Banned in Card Pool',
        unavailable:         'Unavailable',
    },

    adjustment: {
        nerf:   'Nerf',
        buff:   'Buff',
        adjust: 'Adjust',
    },

    card,
    ui,
    tag,
    search,
};

import ui from './ui';
import set from './set';
import search from './search';

export default {
    '$self':     'MTG',
    '$selfFull': 'Magic: the Gathering',

    '$title': {
        'banlist':       'Banned & Restricted List',
        'format-change': 'Format Change',
    },

    'card': {
        '$self': 'Card',

        'text-mode': {
            oracle:  'Oracle',
            unified: 'Unified',
            printed: 'Printed',
        },
    },

    set,

    'format': {
        '$self': 'Format',

        'standard': 'Standard',
        'pioneer':  'Pioneer',
        'modern':   'Modern',
        'extended': 'Extended',
        'legacy':   'Legacy',
        'vintage':  'Vintage',

        'alchemy':  'Alchemy',
        'historic': 'Historic',
        'explorer': 'Explorer',
        'timeless': 'Timeless',

        'standard/arena': 'Arena Standard',

        'commander':           'Commander',
        'duelcommander':       'Duel Commander',
        'leviathan_commander': 'Leviathan Commander',
        'commander1v1':        'Commander 1v1',
        'brawl':               'Brawl',
        'standard_brawl':      'Standard Brawl',

        'pauper':               'Pauper',
        'oathbreaker':          'Oathbreaker',
        'penny':                'Penny Dreadful',
        'canadian_highlander':  'Canadian Highlander',
        'pauper_commander':     'Pauper Commander',
        'pauper_duelcommander': 'Pauper Duel Commander',

        'two_head_giant': 'Two Head Giant',

        '100_card_singleton': '100 Card Singleton',
        'kaleidoscope':       'Kaleidoscope',
        'online_classic':     'Online Classic',
        'online_commander':   'Online Commander',
        'prismatic':          'Prismatic',
        'singleton':          'Singleton',
        'tribal':             'Tribal',
    },

    'rarity': {
        $self: 'Rarity',

        common:   'Common',
        uncommon: 'Uncommon',
        rare:     'Rare',
        mythic:   'Mythic Rare',
        special:  'Special',
    },

    'legality': {
        $self: 'Legality',

        legal:               'Legal',
        banned:              'Banned',
        banned_in_bo1:       'Banned in BO1',
        suspended:           'Suspended',
        restricted:          'Restricted',
        unavailable:         'Unavailable',
        banned_as_commander: 'Banned as Commander',
        banned_as_companion: 'Banned as Companion',
        game_changer:        'Game Changer',
    },

    'tag': {
        'reserved':        'Reserved',
        'full-art':        'Full Art',
        'oversized':       'Oversized',
        'story-spotlight': 'Story Spotlight',
        'textless':        'Textless',
    },

    'image-wall': 'Image Wall',

    'cr': {
        $self:    'CompRules',
        intro:    'Introduction',
        glossary: 'Glossary',
        credits:  'Credits',
        csi:      'Customer Service Information',

        diff:    'CR Differences',
        history: 'CR History',
    },

    ui,
    search,
};

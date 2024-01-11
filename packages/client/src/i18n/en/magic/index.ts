import ui from './ui';
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

    'set': {
        $self: 'Set',
    },

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
        'historic_brawl':      'Historic Brawl',

        'pauper':           'Pauper',
        'oathbreaker':      'Oathbreaker',
        'penny':            'Penny Dreadful',
        'pauper_commander': 'Pauper Commander',

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
        suspended:           'Suspended',
        restricted:          'Restricted',
        unavailable:         'Unavailable',
        banned_as_commander: 'Banned as Commander',
        banned_as_companion: 'Banned as Companion',
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

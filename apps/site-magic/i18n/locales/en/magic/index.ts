import search from './search';

export default {
  $self: 'Magic',
  $full: 'Magic: The Gathering',

  format: {
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
    'duelcommander_docfx': 'Duel Commander (DocFX Fork)',
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

  rarity: {
    $self: 'Rarity',

    common:   'Common',
    uncommon: 'Uncommon',
    rare:     'Rare',
    mythic:   'Mythic Rare',
    special:  'Special',
  },

  legality: {
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
    score:               'Score {n}',
  },

  tag: {
    'reserved':        'Reserved',
    'full-art':        'Full Art',
    'oversized':       'Oversized',
    'story-spotlight': 'Story Spotlight',
    'textless':        'Textless',
  },

  ui: {
    format: {
      banlist:  'Banlist',
      set:      'Sets',
      no_data:  'No data',
      save_svg: 'Save SVG',

      group: {
        ante:       'Ante',
        legendary:  'Legendary',
        conspiracy: 'Conspiracy',
        unfinity:   'Unfinity',
        offensive:  'Offensive',
      },
    },
  },

  rule: {
    '$self':      'Comprehensive Rules',
    'diff':       'Rule Diff',
    'history':    'Rule History',
    'show-minor': 'Show Minor Changes',
    'copy-text':  'Rule text copied',
  },

  search,
};

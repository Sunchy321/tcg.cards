// import type { LocaleMessageValue } from 'vue-i18n';

// import { GAMES } from '#shared';

// const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

// import omni from './omni';
// import magic from './magic';
// import hearthstone from './hearthstone';

export default {
  lang: {
    '$self': 'English',

    'en':  'English',
    'de':  'German',
    'es':  'Spanish',
    'fr':  'French',
    'it':  'Italian',
    'ja':  'Japanese',
    'ko':  'Korean',
    'mx':  'Mexican Spanish',
    'pl':  'Polish',
    'pt':  'Portuguese',
    'ru':  'Russian',
    'th':  'Thai',
    'zhs': 'Simplified Chinese',
    'zht': 'Traditional Chinese',
    'he':  'Hebrew',
    'la':  'Latin',
    'grc': 'Ancient Greek',
    'ar':  'Arabic',
    'sa':  'Sanskrit',
    'ph':  'Phyrexian',

    'en:asia': 'English (Asia)',
    'zhs:pro': 'Simplified Chinese (YGOPro)',
    'zhs:nw':  'Simplified Chinese (NW)',
    'zhs:cn':  'Simplified Chinese (CNOCG)',
    'zhs:md':  'Simplified Chinese (Master Duel)',
  },

  search: {
    error: {
      'unknown-token':   'unknown token',
      'unknown-command': 'unknown command {name}',
    },

    separator: {
      '&': 'and',
      '|': 'or',
    },

    operator: {
      'match':            ' matches ',
      'not-match':        ' doesn\'t match',
      'equal':            ' is equal to ',
      'not-equal':        ' isn\'t equal to ',
      'less-than':        ' is less than',
      'less-or-equal':    ' is less than or equal to ',
      'greater-than':     ' is greater than',
      'greater-or-equal': ' is greater than or equal to ',

      'include':     ' includes ',
      'not-include': ' doesn\'t include ',
      'is':          ' is ',
      'is-not':      ' isn\'t ',

      'count-is':               ' count is ',
      'count-is-not':           ' count isn\'t ',
      'count-greater-than':     ' count is greater than ',
      'count-greater-or-equal': ' count is greater than or equal to ',
      'count-less-than':        ' count is less than ',
      'count-less-or-equal':    ' count is less than or equal to ',

      'fully-match':     ' fully matches',
      'not-fully-match': ' doesn\'t fully match',
    },

    qualifier: {
      '!': 'not',
    },
  },

  // omnisearch: gameI18n['./omnisearch/index.ts'],

  // ...Object.fromEntries(GAMES.map(g => [g, gameI18n[`./${g}/index.ts`]])),

  settings: {
    $self:       'Settings',
    account:     'Account',
    notLoggedIn: 'You are not logged in.',

    login:              'Login',
    loginFailed:        'Login failed',
    loginSuccess:       'Logged in successfully',
    loginRequired:      'Please log in to access account settings.',
    logout:             'Logout',
    logoutSuccess:      'Logged out successfully',
    register:           'Register',
    registerFailed:     'Registration failed',
    registerSuccess:    'Account created successfully',
    createAccount:      'Create an account',
    alreadyHaveAccount: 'Already have an account?',

    profile:     'Profile',
    displayName: 'Display Name',
    email:       'Email',
    password:    'Password',

    emailPlaceholder:       'your{\'@\'}email.com',
    passwordPlaceholder:    'Enter your password',
    namePlaceholder:        'Your name',
    newPasswordPlaceholder: 'At least 8 characters',

    changePassword:  'Change Password',
    currentPassword: 'Current password',
    newPassword:     'New password',
    passwordUpdated: 'Password updated successfully',

    save:          'Save',
    updateSuccess: 'Updated successfully',
    updateFailed:  'Update failed',

    dangerZone: 'Danger Zone',

    role: {
      owner:     'Owner',
      admin:     'Admin',
      gameAdmin: 'Game Admin',
      user:      'User',
    },

    general: {
      $self:      'General',
      uiLanguage: 'Interface Language',
    },

    game: {
      $self:    'Game',
      language: 'Game Language',
    },
  },

  hearthstone: {
    $self: 'Hearthstone',
    $full: 'Hearthstone',

    card: {
      '$self':      'Cards',
      'versions':   'Versions',
      'not-found':  'Card not found',
      'tag-copied': 'Tag copied',

      'variant': {
        normal:        'Normal',
        golden:        'Golden',
        diamond:       'Diamond',
        signature:     'Signature',
        battlegrounds: 'Battlegrounds',
      },

      'type': {
        null:                     'Unknown',
        game:                     'Game',
        player:                   'Player',
        hero:                     'Hero',
        minion:                   'Minion',
        spell:                    'Spell',
        enchantment:              'Enchantment',
        weapon:                   'Weapon',
        item:                     'Item',
        token:                    'Token',
        hero_power:               'Hero Power',
        blank:                    'Blank',
        game_mode_button:         'Game Mode Button',
        move_minion_hover_target: 'Move Minion Hover Target',
        mercenary_ability:        'Mercenary Ability',
        buddy_meter:              'Buddy Meter',
        location:                 'Location',
        quest_reward:             'Quest Reward',
        tavern_spell:             'Tavern Spell',
        anomaly:                  'Anomaly',
        trinket:                  'Trinket',
        pet:                      'Pet',
      },

      'race': {
        bloodelf:  'Blood Elf',
        draenei:   'Draenei',
        dwarf:     'Dwarf',
        gnome:     'Gnome',
        goblin:    'Goblin',
        human:     'Human',
        nightelf:  'Night Elf',
        orc:       'Orc',
        tauren:    'Tauren',
        troll:     'Troll',
        undead:    'Undead',
        worgen:    'Worgen',
        goblin2:   'Goblin',
        murloc:    'Murloc',
        demon:     'Demon',
        scourge:   'Scourge',
        mech:      'Mech',
        elemental: 'Elemental',
        ogre:      'Ogre',
        beast:     'Beast',
        totem:     'Totem',
        nerubian:  'Nerubian',
        pirate:    'Pirate',
        dragon:    'Dragon',
        blank:     'None',
        all:       'All',
        egg:       'Egg',
        quilboar:  'Quilboar',
        centaur:   'Centaur',
        furbolg:   'Furbolg',
        highelf:   'High Elf',
        treant:    'Treant',
        halforc:   'Half-Orc',
        lock:      'Lock',
        naga:      'Naga',
        old_god:   'Old God',
        pandaren:  'Pandaren',
        gronn:     'Gronn',
        celestial: 'Celestial',
        gnoll:     'Gnoll',
        golem:     'Golem',
        vulpera:   'Vulpera',
      },

      'spell-school': {
        arcane:          'Arcane',
        fire:            'Fire',
        frost:           'Frost',
        nature:          'Nature',
        holy:            'Holy',
        shadow:          'Shadow',
        fel:             'Fel',
        physical_combat: 'Physical Combat',
        tavern_spell:    'Tavern Spell',
        spellcraft:      'Spellcraft',
        lesser_trinket:  'Lesser Trinket',
        greater_trinket: 'Greater Trinket',
        upgrade:         'Upgrade',
      },
    },

    tag: {},

    legality: {
      legal:       'Legal',
      banned:      'Banned',
      restricted:  'Restricted',
      wild:        'Wild',
      unavailable: 'Unavailable',
    },

    set: {
      $self: 'Sets',
    },

    format: {
      $self:         'Formats',
      standard:      'Standard',
      wild:          'Wild',
      twist:         'Twist',
      classic:       'Classic',
      battlegrounds: 'Battlegrounds',
      mercenaries:   'Mercenaries',
      arena:         'Arena',
      duel:          'Duels',
      tavern_brawl:  'Tavern Brawl',
      adventure:     'Adventure',
    },

    patch: {
      $self: 'Patches',
    },
  },

  // omni,
  // magic,
  // hearthstone,
};

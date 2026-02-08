import { LocaleMessageValue } from 'vue-i18n';

import { games } from '@interface/index';

const gameI18n = import.meta.glob<LocaleMessageValue>('./*/index.ts', { eager: true, import: 'default' });

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

    user: {
        'username':  'Username',
        'email':     'Email',
        'password':  'Password',
        'roles':     'Role',
        'createdAt': 'Created At',

        'repeat-password': 'Repeat Password',

        'login':    'Log in',
        'logout':   'Log out',
        'register': 'Sign up',

        'passwordHint':
            'At least 8 characters, and must includes lower & upper letters, digits and special characters',
        'weakPassword': 'Your password is too weak',

        'error': {
            REQUIRE_USERNAME:        'Username Required',
            REQUIRE_EMAIL:           'Email Required',
            INVALID_EMAIL:           'Invalid Email Address',
            REQUIRE_PASSWORD:        'Password Required',
            WRONG_REPEATED_PASSWORD: 'Wrong Repeated Password',
        },

        'role': {
            user:  'User',
            admin: 'Administrator',
            owner: 'Owner',
        },
    },

    setting: {
        '$self': 'Settings',
        'basic': 'Basic Settings',
        'lang':  'Language',

        'api-key': {
            '$self':      'API Keys',
            'name':       'Name',
            'created-at': 'Created At',
            'delete':     'Delete',
            'cancel':     'Cancel',

            'create-success': 'API Key created successfully.',
            'create-hint':    'API Key only shows once, please save it.',
            'copied':         'API Key copied.',

            'delete-key':  'Delete API Key',
            'delete-hint': 'Are you sure to delete this API Key? This action cannot be undone! Please repeat {name} in the text box to confirm deletion.',
            'deleted':     'API Key deleted successfully.',
        },
    },

    ui: {
        search: 'Search',

        ai: {
            'convert-search-syntax': 'AI Convert Search Syntax',
            'ai-search-mode':        'AI Search Mode',
            'normal-search-mode':    'Normal Search Mode',
            'chat':                  'AI Chat',
            'select-game':           'Select Game',
            'welcome-title':         'Welcome to AI Search Assistant',
            'welcome-intro':         'I can help you:',
            'feature-convert':       'Convert natural language to search queries',
            'feature-recommend':     'Recommend suitable cards',
            'feature-synergy':       'Analyze card synergies',
            'feature-deck':          'Provide deck building suggestions',
            'input-placeholder':     'Enter your question or search request...',
            'clear-chat':            'Clear Chat',
            'search-syntax':         'Search Syntax',
            'execute-search':        'Execute Search',
            'error-message':         'Sorry, I encountered an issue. Please try again later.',
            'quick-action':          {
                magic: {
                    'blue-instant':   'Blue Instants',
                    'blue-instant-q': 'Recommend some powerful blue instant spells',
                    'removal':        'Removal 2-3 CMC',
                    'removal-q':      'Find some removal spells with CMC 2-3',
                    'commander':      'Commander Recommendations',
                    'commander-q':    'Recommend commanders suitable for beginners',
                },
                yugioh: {
                    'lv4-dark':   'Lv4 DARK',
                    'lv4-dark-q': 'Recommend powerful Level 4 DARK monsters',
                    'removal':    'S/T Removal',
                    'removal-q':  'Find cards that can destroy Spell/Trap cards',
                    'handtrap':   'Hand Traps',
                    'handtrap-q': 'Recommend commonly used hand trap cards',
                },
                hearthstone: {
                    'mage-spell':   'Mage Spells',
                    'mage-spell-q': 'Recommend powerful mage spells',
                    'minion-3':     '3-Cost Minions',
                    'minion-3-q':   'Find some quality 3-cost minions',
                    'draw':         'Card Draw',
                    'draw-q':       'Recommend cards with draw mechanics',
                },
            },
        },
    },

    common: {
        add:    'Add',
        edit:   'Edit',
        delete: 'Delete',
        save:   'Save',
        cancel: 'Cancel',
        back:   'Back',
        close:  'Close',
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

    omnisearch: gameI18n['./omnisearch/index.ts'],

    ...Object.fromEntries(games.map(g => [g, gameI18n[`./${g}/index.ts`]])),
};

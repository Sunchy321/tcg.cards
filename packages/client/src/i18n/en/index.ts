import { games } from '@interface/index';

const gameI18n = import.meta.glob('./*/index.ts', { eager: true, import: 'default' });

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
            'match':         ' matches ',
            'not-match':     ' doesn\'t match',
            'equal':         ' is equal to ',
            'not-equal':     ' isn\'t equal to ',
            'less-than':     ' is less than',
            'less-equal':    ' is less than or equal to ',
            'greater-than':  ' is greater than',
            'greater-equal': ' is greater than or equal to ',

            'include':     ' includes ',
            'not-include': ' doesn\'t include ',
            'is':          ' is ',
            'is-not':      ' isn\'t ',

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

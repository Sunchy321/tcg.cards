import magic from './magic';
import hearthstone from './hearthstone';

export default {
    lang: {
        $self: 'English',

        en:  'English',
        de:  'German',
        es:  'Spanish',
        fr:  'French',
        it:  'Italian',
        ja:  'Japanese',
        ko:  'Korean',
        mx:  'Mexican Spanish',
        pl:  'Polish',
        pt:  'Portuguese',
        ru:  'Russian',
        th:  'Thai',
        zhs: 'Simplified Chinese',
        zht: 'Traditional Chinese',
        he:  'Hebrew',
        la:  'Latin',
        grc: 'Ancient Greek',
        ar:  'Arabic',
        sa:  'Sanskrit',
        ph:  'Phyrexian',
    },

    user: {
        username: 'Username',
        password: 'Password',
        login:    'Log in',
        logout:   'Log out',
        register: 'Sign up',

        passwordHint:
            'At least 8 characters, and must includes lower & upper letters, digits and special characters',
        weakPassword: 'Your password is too weak',

        role: {
            normal: 'Normal user',
            admin:  'Administrator',
        },
    },

    setting: {
        $self: 'Settings',
        basic: 'Basic Settings',
        lang:  'Language',
    },

    ui: {
        search: 'Search',
    },

    search: {
        error: {
            'unknown-token': 'unknown token',
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

    magic,
    hearthstone,
};

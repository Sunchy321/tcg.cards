import magic from './magic';
import hearthstone from './hearthstone';

export default {
    lang: {
        $self: 'English',

        en:  'English',
        es:  'Spanish',
        fr:  'French',
        de:  'German',
        it:  'Italian',
        pt:  'Portuguese',
        ja:  'Japanese',
        ko:  'Korean',
        ru:  'Russian',
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
        basic: 'Basic Settings',

        lang: 'Language',
    },

    data: 'Data',

    magic,
    hearthstone,
};

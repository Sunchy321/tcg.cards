import magic from './magic';
import hearthstone from './hearthstone';

export default {
    lang: {
        $self: 'English',

        enUS: 'English',
        esES: 'Spanish',
        frFR: 'French',
        deDE: 'German',
        itIT: 'Italian',
        ptPT: 'Portuguese',
        jaJP: 'Japanese',
        koKR: 'Korean',
        ruRU: 'Russian',
        zhCN: 'Simplified Chinese',
        zhCT: 'Traditional Chinese',
        he:   'Hebrew',
        la:   'Latin',
        grc:  'Ancient Greek',
        ar:   'Arabic',
        sa:   'Sanskrit',
        px:   'Phyrexian',
    },

    login: {
        username: 'Username',
        password: 'Password',
        login:    'Log in',
        register: 'Sign up',

        passwordHint:
            'At least 8 characters, and must includes lower & upper letters, digits and special characters',
        weakPassword: 'Your password is too weak',
    },

    profile: {
        logout: 'Log out',

        role: {
            normal: 'Normal user',
            admin:  'Administrator',
        },
    },

    data: 'Data',

    magic,
    hearthstone,
};

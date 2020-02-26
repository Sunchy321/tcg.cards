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
        px:   'Phyrexian'
    },

    game: {
        magic: 'Magic the Gathering',
        hearthstone: 'Hearthstone'
    },

    drawer: {

    },

    title: {
        default: '',

        magic: {
            format:          'Formats',
            'format-change': 'Format Changes',
            set:             'Sets',
            card:            'Cards'
        }
    },

    magic: {
        $self: 'MTG',

        format: {
            order:        'Order',
            localization: 'Localization',

            'localization/column': {
                lang: 'Language',
                name: 'Name'
            },

            standard: 'Standard',
            pioneer:  'Pioneer',
            modern:   'Modern',
            extended: 'Extended',
            legacy:   'Legacy',
            vintage:  'Vintage',

            'standard/arena': 'Arena Standard',

            commander:     'Commander',
            duelcommander: 'Duel Commander',
            commander1v1:  'Commander 1v1',
            brawl:         'Brawl',

            pauper: 'Pauper',

            two_head_giant: 'Two Head Giant',

            '100_card_singleton': '100 Card Singleton',
            kaleidoscope:         'Kaleidoscope',
            online_classic:       'Online Classic',
            online_commander:     'Online Commander',
            prismatic:            'Prismatic',
            singleton:            'Singleton',
            tribal:               'Tribal'
        },

        'format-change': {
            type: 'Type',

            'type/option': {
                'banlist-change': 'Banlist Change'
            },

            source: 'Source',

            'source/option': {
                wotc:          'WotC',
                mtgcommander:  'Commander',
                duelcommander: 'Duel Commander'
            },

            category: 'Category',

            'category/option': {
                pioneer:      'Pioneer',
                commander1v1: 'Commander 1v1'
            },

            tabletop: 'Tabletop',
            online:   'Magic Online',
            arena:    'Magic Arena',

            format: 'Format'
        },

        set: {
            'sync-with-scryfall': 'Sync with Scryfall',
            'sync-with-mtgjson':  'Sync with MTGJSON',

            'scryfall-code': 'Scryfall Code',
            'scryfall-id':   'Scryfall ID',
            'online-code':   'Online Code',
            'tcgplayer-id':  'TCGPlayer ID',

            block:  'Block',
            parent: 'Parent',

            'set-type':     'Set Type',
            'is-digital':   'Is Digital',
            'is-foil-only': 'Is Foil Only',
            'release-date': 'ReleaseDate',
            'card-count':   'Card Count',

            localization: 'Localization',

            'localization/column': {
                lang:  'Language',
                name:  'Name',
                block: 'Block',
                link:  'Link'
            }
        }
    }
};

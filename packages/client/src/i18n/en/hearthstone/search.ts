export default {
    'full-command': {
        'raw':              'name includes {value}',
        'raw-mana':         'mana cost or text includes {value}',
        'full-stats':       'cost is {cost} and attack is {attack} and health is {health}',
        'stats':            'attack is {attack} and health is {health}',
        'hash':             'has tag {tag}',
        'order':            'order by {value}',
        'order-ascending':  'order by {value} (ascending)',
        'order-descending': 'order by {value} (descending)',
    },

    'command': {
        'set':          'set',
        'lang':         'language',
        'cost':         'mana cost',
        'race':         'race',
        'spell-school': 'spell school',
        'attack':       'attack',
        'health':       'health',
        'text':         'text',
        'rarity':       'rarity',
        'format':       'format',
        'order':        'order',
    },

    'parameter': {
        rarity: {
            common:    'common',
            rare:      'rare',
            epic:      'epic',
            legendary: ' legendary',
        },

        order: {
            name: 'name',
            date: 'release date',
            id:   'card id',
            cost: 'mana cost',
        },
    },
};

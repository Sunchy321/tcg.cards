export default {
    'full-command': {
        'raw':              'name includes {parameter}',
        'raw-mana':         'mana cost or text includes {parameter}',
        'full-stats':       'cost is {cost} and attack is {attack} and health is {health}',
        'stats':            'attack is {attack} and health is {health}',
        'hash':             'has tag {tag}',
        'order':            'order by {parameter}',
        'order-ascending':  'order by {parameter} (ascending)',
        'order-descending': 'order by {parameter} (descending)',
    },

    'command': {
        'set':          'set',
        'lang':         'language',
        'cost':         'mana cost',
        'race':         'race',
        'spell-school': 'spell school',
        'attack':       'attack',
        'health':       'health',
        'format':       'format',
        'order':        'order',
    },

    'parameter': {
        order: {
            name: 'name',
            date: 'release date',
            id:   'card id',
            cost: 'mana value',
        },
    },
};

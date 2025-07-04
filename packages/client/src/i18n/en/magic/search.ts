export default {
    'full-command': {
        'raw':              'name includes {parameter}',
        'raw-mana':         'mana cost or text includes {parameter}',
        'stats':            'power is {power} and toughness is {toughness}',
        'hash':             'has tag {tag}',
        'order':            'order by {parameter}',
        'order-ascending':  'order by {parameter} (ascending)',
        'order-descending': 'order by {parameter} (descending)',
    },

    'command': {
        'set':             'set',
        'number':          'collector number',
        'lang':            'language',
        'cost':            'mana cost',
        'mana-value':      'mana value',
        'color':           'color',
        'color-identity':  'color identity',
        'color-indicator': 'color indicator',
        'power':           'power',
        'toughness':       'toughness',
        'loyalty':         'loyalty',
        'defense':         'defense',
        'name':            'name',
        'name:oracle':     'Oracle name',
        'name:unified':    'unified name',
        'name:printed':    'printed name',
        'type':            'type',
        'type:oracle':     'Oracle type',
        'type:unified':    'unified type',
        'type:printed':    'printed type',
        'text':            'text',
        'text:oracle':     'Oracle text',
        'text:unified':    'unified text',
        'text:printed':    'printed text',
        'oracle':          'standard text',
        'flavor-text':     'flavor text',
        'flavor-name':     'flavor name',
        'layout':          'layout',
        'image-status':    'image status',
        'rarity':          'rarity',
        'release-date':    'release date',
        'format':          'format',
        'counter':         'counter',
        'keyword':         'keyword',
        'order':           'order',
    },

    'parameter': {
        'layout': {
            transform: 'Transforming DFC',
            battle:    'Battle',
        },

        'image-status': {
            highres_scan: 'Highres Scan',
            lowres:       'Lowres',
            placeholder:  'Placeholder',
            missing:      'Missing',
        },

        'order': {
            name: 'name',
            date: 'release date',
            id:   'card id',
            cost: 'mana value',
        },
    },
};

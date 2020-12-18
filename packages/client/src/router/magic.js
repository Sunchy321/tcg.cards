const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/magic'),
                meta:      {
                    title:      'magic.$self',
                    fixedInput: true,
                    inputClass: 'index-input',
                    buttons:    [
                        { icon: 'mdi-shuffle-variant', event: 'random' },
                    ],
                },
            },
            {
                path:      'data',
                component: () => import('pages/magic/Data'),
                meta:      {
                    requireAdmin: true,
                    title:        'data',
                },
            },
            {
                path:      'format',
                component: () => import('pages/magic/Format'),
            },
            {
                path:      'set',
                component: () => import('pages/magic/Set'),
            },
            {
                path:      'card/:id',
                name:      'magic/card',
                component: () => import('pages/magic/Card'),
                meta:      {
                    title:   '$input',
                    buttons: [
                        { icon: 'mdi-shuffle-variant', event: 'random' },
                    ],
                },
            },
            {
                path:      'search',
                name:      'magic/search',
                component: () => import('pages/magic/Search'),
                meta:      {
                    title: '$input',
                },
            },
            {
                path:      'image-wall',
                component: () => import('pages/magic/ImageWall'),
                meta:      {
                    title: 'magic.image-wall',
                },
            },
            {
                path:      'cr',
                component: () => import('pages/magic/CR'),
                meta:      {
                    title:         'magic.cr.$self',
                    select:        'date',
                    selectDefault: '$last',
                    buttons:       [
                        { icon: 'mdi-vector-difference', event: 'diff' },
                    ],
                },
            },
            {
                path:      'cr/diff',
                name:      'magic/cr/diff',
                component: () => import('pages/magic/CRDiff'),
                meta:      {
                    title: 'magic.cr.diff',
                },
            },
        ],
    },
];

export default routes;

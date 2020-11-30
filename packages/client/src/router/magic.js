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
                    button:     [
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
                    title:  '$input',
                    button: [
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
        ],
    },
];

export default routes;

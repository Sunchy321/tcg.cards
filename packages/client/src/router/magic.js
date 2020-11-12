const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/magic'),
                meta:      {
                    title: 'magic.$self',
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
                        { icon: 'mdi-shuffle-variant', event: 'randomize' },
                    ],
                },
            },
        ],
    },
];

export default routes;

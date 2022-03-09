const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/magic/Index.vue'),
            },
            {
                path:      'data',
                component: () => import('pages/magic/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
            {
                path:     'format',
                redirect: 'format/standard',
            },
            {
                path:      'format/:id',
                name:      'magic/format',
                component: () => import('pages/magic/Format.vue'),
            },
            {
                path:      'card/:id',
                name:      'magic/card',
                component: () => import('pages/magic/Card.vue'),
            },
            {
                path:      'search',
                name:      'magic/search',
                component: () => import('pages/magic/Search.vue'),
            },
            {
                path:      'image-wall',
                component: () => import('pages/magic/ImageWall.vue'),
            },
            {
                path:      'cr',
                name:      'magic/cr',
                component: () => import('pages/magic/CR.vue'),
            },
            {
                path:      'cr/diff',
                name:      'magic/cr/diff',
                component: () => import('pages/magic/CRDiff.vue'),
            },
        ],
    },
];

export default routes;

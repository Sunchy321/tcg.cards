const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/magic'),
            },
            {
                path:      'data',
                component: () => import('pages/magic/Data'),
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
                component: () => import('pages/magic/Format'),
            },
            {
                path:      'card/:id',
                name:      'magic/card',
                component: () => import('pages/magic/Card'),
            },
            {
                path:      'search',
                name:      'magic/search',
                component: () => import('pages/magic/Search'),
            },
            {
                path:      'image-wall',
                component: () => import('pages/magic/ImageWall'),
            },
            {
                path:      'cr',
                name:      'magic/cr',
                component: () => import('pages/magic/CR'),
            },
            {
                path:      'cr/diff',
                name:      'magic/cr/diff',
                component: () => import('pages/magic/CRDiff'),
            },
        ],
    },
];

export default routes;

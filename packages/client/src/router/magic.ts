/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const routes = [
    {
        path:      '/magic',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'magic',
                component: async () => import('pages/magic/Index.vue'),
            },
            {
                path:      'data',
                name:      'magic/data',
                component: async () => import('pages/magic/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
            {
                path:      'format/:id',
                name:      'magic/format',
                component: async () => import('pages/magic/Format.vue'),
            },
            {
                path:      'set',
                name:      'magic/sets',
                component: async () => import('pages/magic/Sets.vue'),
            },
            {
                path:      'set/:id',
                name:      'magic/set',
                component: async () => import('pages/magic/Set.vue'),
            },
            {
                path:      'card/:id',
                name:      'magic/card',
                component: async () => import('pages/magic/Card.vue'),
            },
            {
                path:      'search',
                name:      'magic/search',
                component: async () => import('pages/magic/Search.vue'),
            },
            {
                path:      'advanced-search',
                name:      'magic/advanced-search',
                component: async () => import('pages/magic/AdvancedSearch.vue'),
            },
            {
                path:      'search-docs',
                name:      'magic/search-docs',
                component: async () => import('pages/magic/SearchDocs.vue'),
            },
            {
                path:      'image-wall',
                component: async () => import('pages/magic/ImageWall.vue'),
            },
            {
                path:      'cr/diff',
                name:      'magic/cr/diff',
                component: async () => import('pages/magic/CRDiff.vue'),
            },
            {
                path:      'cr/history',
                name:      'magic/cr/history',
                component: async () => import('pages/magic/CRHistory.vue'),
            },
        ],
    },
    {
        path:      '/magic',
        component: async () => import('layouts/WithMenu.vue'),
        children:  [
            {
                path:      'cr',
                name:      'magic/cr',
                component: async () => import('pages/magic/CR.vue'),
            },
        ],
    },
];

export default routes;

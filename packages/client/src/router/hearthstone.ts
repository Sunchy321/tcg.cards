/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const routes = [
    {
        path:      '/hearthstone',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'hearthstone',
                component: async () => import('pages/hearthstone/Index.vue'),
            },
            {
                path:      'data',
                name:      'hearthstone/data',
                component: async () => import('pages/hearthstone/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
            {
                path:      'format/:id',
                name:      'hearthstone/format',
                component: async () => import('pages/hearthstone/Format.vue'),
            },
            {
                path:      'set/:id',
                name:      'hearthstone/set',
                component: async () => import('pages/hearthstone/Set.vue'),
            },
            {
                path:      'card/:id',
                name:      'hearthstone/card',
                component: async () => import('pages/hearthstone/Card.vue'),
            },
            {
                path:      'entity/:id',
                name:      'hearthstone/entity',
                component: async () => import('pages/hearthstone/Entity.vue'),
            },
            {
                path:      'search',
                name:      'hearthstone/search',
                component: async () => import('pages/hearthstone/Search.vue'),
            },
            {
                path:      'log-parse',
                name:      'hearthstone/log-parse',
                component: async () => import('pages/hearthstone/LogParse.vue'),
            },
            {
                path:      'misc',
                name:      'hearthstone/misc',
                redirect:  { name: 'hearthstone/misc/tag' },
                component: async () => import('pages/hearthstone/Misc.vue'),
                children:  [
                    {
                        path:      'tag',
                        name:      'hearthstone/misc/tag',
                        component: async () => import('pages/hearthstone/misc/Tag.vue'),
                    },
                ],
            },
        ],
    },
];

export default routes;

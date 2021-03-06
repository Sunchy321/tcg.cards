/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const routes = [
    {
        path:      '/hearthstone',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: async () => import('pages/hearthstone/Index.vue'),
            },
            {
                path:      'data',
                component: async () => import('pages/hearthstone/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
            {
                path:      'card/:id',
                name:      'hearthstone/card',
                component: async () => import('pages/hearthstone/Card.vue'),
            },
            {
                path:      'log-parse',
                name:      'hearthstone/log-parse',
                component: async () => import('pages/hearthstone/LogParse.vue'),
            },
        ],
    },
];

export default routes;

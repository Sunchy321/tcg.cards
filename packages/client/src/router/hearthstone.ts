import { RouteRecordRaw } from 'vue-router';

import { createDefaultRoute } from './routes';

const routes: RouteRecordRaw[] = [
    ...createDefaultRoute('hearthstone'),
    {
        path:      '/hearthstone',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'entity/:id',
                name:      'hearthstone/entity',
                component: async () => import('pages/hearthstone/Entity.vue'),
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

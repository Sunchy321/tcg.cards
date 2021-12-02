/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import magic from './magic';
import hearthstone from './hearthstone';

const routes = [
    {
        path:      '/',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: async () => import('pages/Index.vue'),
            },
            {
                path:      'setting',
                name:      'setting',
                component: async () => import('pages/Setting.vue'),
                meta:      {
                    title: 'setting.$self',
                },
            },
        ],
    },

    ...magic,
    ...hearthstone,

    {
        path:      '/:pathMatch(.*)*',
        component: async () => import('pages/Error404.vue'),
    },
];

export default routes;

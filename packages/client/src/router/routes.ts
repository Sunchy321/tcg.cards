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
                name:      '',
                component: async () => import('pages/Index.vue'),
            },
        ],
    },

    {
        path:      '/setting',
        component: async () => import('layouts/Setting.vue'),
        children:  [
            {
                path:      '',
                name:      'setting',
                component: async () => import('pages/setting/Basic.vue'),
            },
            {
                path:      'magic',
                name:      'setting/magic',
                component: async () => import('pages/setting/Magic.vue'),
            },
            {
                path:      'hearthstone',
                name:      'setting/hearthstone',
                component: async () => import('pages/setting/Hearthstone.vue'),
            },
        ],
    },

    ...magic,
    ...hearthstone,

    {
        path:      '/:pathMatch(.*)*',
        name:      'error',
        component: async () => import('pages/Error404.vue'),
    },
];

export default routes;

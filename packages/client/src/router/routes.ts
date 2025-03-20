import magic from './magic';
import hearthstone from './hearthstone';
import lorcana from './lorcana';

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
            {
                path:      'lorcana',
                name:      'setting/lorcana',
                component: async () => import('pages/setting/Lorcana.vue'),
            },
        ],
    },

    ...magic,
    ...hearthstone,
    ...lorcana,

    {
        path:      '/:pathMatch(.*)*',
        name:      'error',
        component: async () => import('pages/Error404.vue'),
    },
];

export default routes;

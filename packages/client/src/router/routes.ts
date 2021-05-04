import magic from './magic';
import hearthstone from './hearthstone';

const routes = [
    {
        path:      '/',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/Index.vue'),
            },
            {
                path:      'setting',
                name:      'setting',
                component: () => import('pages/Setting.vue'),
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
        component: () => import('pages/Error404.vue'),
    },
];

export default routes;

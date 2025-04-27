import { RouteRecordRaw } from 'vue-router';

import { capitalize } from 'lodash';

import magic from './magic';
import yugioh from './yugioh';
import hearthstone from './hearthstone';
import lorcana from './lorcana';

import { games } from 'static/index';

const routes: RouteRecordRaw[] = [
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
            ...games.map(g => ({
                path:      g,
                name:      `setting/${g}`,
                component: async () => import(`pages/setting/${capitalize(g)}.vue`),
            })),
        ],
    },

    ...magic,
    ...yugioh,
    ...hearthstone,
    ...lorcana,

    {
        path:      '/:pathMatch(.*)*',
        name:      'error',
        component: async () => import('pages/Error404.vue'),
    },
];

export function createDefaultRoute(game: string): RouteRecordRaw[] {
    return [
        {
            path:      `/${game}`,
            component: async () => import('layouts/Main.vue'),
            children:  [
                {
                    path:      '',
                    name:      game,
                    component: async () => import(`pages/${game}/Index.vue`),
                },
                {
                    path:      'data',
                    name:      `${game}/data`,
                    component: async () => import(`pages/${game}/Data.vue`),
                    meta:      {
                        admin: true,
                    },
                },
                {
                    path:      'format/:id',
                    name:      `${game}/format`,
                    component: async () => import(`pages/${game}/Format.vue`),
                },
                {
                    path:      'set',
                    name:      `${game}/sets`,
                    component: async () => import(`pages/${game}/Sets.vue`),
                },
                {
                    path:      'set/:id',
                    name:      `${game}/set`,
                    component: async () => import(`pages/${game}/Set.vue`),
                },
                {
                    path:      'card/:id',
                    name:      `${game}/card`,
                    component: async () => import(`pages/${game}/Card.vue`),
                },
                {
                    path:      'search',
                    name:      `${game}/search`,
                    component: async () => import(`pages/${game}/Search.vue`),
                },
            ],
        },
    ];
}

export default routes;

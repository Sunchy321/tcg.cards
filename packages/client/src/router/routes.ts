import { RouteRecordRaw } from 'vue-router';

import { capitalize } from 'lodash';

import { games } from '@interface/index';

const gameRoutes = import.meta.glob<true, string, RouteRecordRaw[]>(
    ['./*.ts', '!./route.ts', '!./index.ts'],
    { eager: true, import: 'default' },
);

const routes: RouteRecordRaw[] = [
    {
        path:      '/',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      '',
                component: async () => import('src/pages/main/Index.vue'),
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
    {
        path:      '/register',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'register',
                component: async () => import('pages/Register.vue'),
            },
        ],
    },

    {
        path:      '/article',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'article',
                component: async () => import('pages/Article.vue'),
            },
        ],
    },

    {
        path:      '/main',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '/search',
                name:      'omnisearch',
                component: async () => import('pages/omnisearch/Search.vue'),
            },
            {
                path: '/data',
                name: 'main/data',
                meta: {
                    admin: 'admin',
                },
                component: async () => import('pages/main/Data.vue'),
            },

        ],
    },

    {
        path:      '/omnisearch',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'omnisearch',
                component: async () => import('pages/omnisearch/Search.vue'),
            },
        ],
    },

    ...games.map(g => gameRoutes[`./${g}.ts`]).flat(),

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
                        admin: `admin/${game}`,
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

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const routes = [
    {
        path:      '/lorcana',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                name:      'lorcana',
                component: async () => import('pages/lorcana/Index.vue'),
            },
            {
                path:      'data',
                name:      'lorcana/data',
                component: async () => import('pages/lorcana/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
            // {
            //     path:      'format/:id',
            //     name:      'lorcana/format',
            //     component: async () => import('pages/lorcana/Format.vue'),
            // },
            {
                path:      'set',
                name:      'lorcana/sets',
                component: async () => import('pages/lorcana/Sets.vue'),
            },
            {
                path:      'set/:id',
                name:      'lorcana/set',
                component: async () => import('pages/lorcana/Set.vue'),
            },
            {
                path:      'card/:id',
                name:      'lorcana/card',
                component: async () => import('pages/lorcana/Card.vue'),
            },
            {
                path:      'search',
                name:      'lorcana/search',
                component: async () => import('pages/lorcana/Search.vue'),
            },
            // {
            //     path:      'misc',
            //     name:      'lorcana/misc',
            //     redirect:  { name: 'lorcana/misc/symbol' },
            //     component: async () => import('pages/lorcana/Misc.vue'),
            //     children:  [
            //         {
            //             path:      'symbol',
            //             name:      'lorcana/misc/symbol',
            //             component: async () => import('pages/lorcana/misc/Symbol.vue'),
            //         },
            //         {
            //             path:      'keyword',
            //             name:      'lorcana/misc/keyword',
            //             component: async () => import('pages/lorcana/misc/Keyword.vue'),
            //         },
            //     ],
            // },
        ],
    },
];

export default routes;

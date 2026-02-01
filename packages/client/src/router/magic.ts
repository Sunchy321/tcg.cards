import { RouteRecordRaw } from 'vue-router';

import { createDefaultRoute } from './routes';

const routes: RouteRecordRaw[] = [
    ...createDefaultRoute('magic'),
    {
        path:      '/magic',
        component: async () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'set/:setId/booster/:boosterId',
                name:      'magic/set/booster',
                component: async () => import('pages/magic/set/Booster.vue'),
            },
            {
                path:      'advanced-search',
                name:      'magic/advanced-search',
                component: async () => import('pages/magic/AdvancedSearch.vue'),
            },
            {
                path:      'search-docs',
                name:      'magic/search-docs',
                component: async () => import('pages/magic/SearchDocs.vue'),
            },
            {
                path:      'decks',
                name:      'magic/decks',
                component: async () => import('pages/magic/Decks.vue'),
            },
            {
                path:      'deck/:deckId',
                name:      'magic/deck',
                component: async () => import('pages/magic/Deck.vue'),
            },
            {
                path:      'rule/diff',
                name:      'magic/rule/diff',
                component: async () => import('src/pages/magic/RuleDiff.vue'),
            },
            {
                path:      'rule/history',
                name:      'magic/rule/history',
                component: async () => import('src/pages/magic/RuleHistory.vue'),
            },
            {
                path:      'misc',
                name:      'magic/misc',
                redirect:  { name: 'magic/misc/symbol' },
                component: async () => import('pages/magic/Misc.vue'),
                children:  [
                    {
                        path:      'symbol',
                        name:      'magic/misc/symbol',
                        component: async () => import('pages/magic/misc/Symbol.vue'),
                    },
                    {
                        path:      'keyword',
                        name:      'magic/misc/keyword',
                        component: async () => import('pages/magic/misc/Keyword.vue'),
                    },
                ],
            },
        ],
    },
    {
        path:      '/magic',
        component: async () => import('layouts/WithMenu.vue'),
        children:  [
            {
                path:      'rule',
                name:      'magic/rule',
                component: async () => import('src/pages/magic/Rule.vue'),
            },
        ],
    },
];

export default routes;

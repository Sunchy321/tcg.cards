const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'control/load-scryfall',
                component: () => import('pages/magic/control/LoadScryfall')
            },
        ]
    },
];

export default routes;

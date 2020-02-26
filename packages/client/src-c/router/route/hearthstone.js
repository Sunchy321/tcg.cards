const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'parse-log',
                component: () => import('pages/hearthstone/LogParser')
            },
        ]
    },
];

export default routes;

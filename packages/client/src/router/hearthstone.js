const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/hearthstone/Index')
            },
        ]
    },
];

export default routes;

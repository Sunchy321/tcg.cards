const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'control/get-bulk',
                component: () => import('pages/magic/control/GetBulk')
            },
        ]
    },
];

export default routes;
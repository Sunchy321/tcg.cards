import { createMemoryHistory, createRouter } from 'vue-router';

const router = createRouter({
  history: createMemoryHistory(),
  routes:  [
    { path: '/', component: () => import('./pages/index.vue') },
    { path: '/user', component: () => import('./pages/user/index.vue') },
    { path: '/settings', component: () => import('./pages/settings/index.vue') },

    // Magic pages
    { path: '/magic', component: () => import('./pages/magic/index.vue') },
    { path: '/magic/announcement', component: () => import('./pages/magic/announcement/index.vue') },
    { path: '/magic/card', component: () => import('./pages/magic/card/index.vue') },
    { path: '/magic/format', component: () => import('./pages/magic/format/index.vue') },
    { path: '/magic/set', component: () => import('./pages/magic/set/index.vue') },
    { path: '/magic/data-source', component: () => import('./pages/magic/data-source/index.vue') },
    { path: '/magic/rule', component: () => import('./pages/magic/rule/index.vue') },
    { path: '/magic/rule/view', component: () => import('./pages/magic/rule/view.vue') },
    { path: '/magic/rule/changes', component: () => import('./pages/magic/rule/changes.vue') },

    // Hearthstone pages
    { path: '/hearthstone', component: () => import('./pages/hearthstone/index.vue') },
    { path: '/hearthstone/announcement', component: () => import('./pages/hearthstone/announcement/index.vue') },
    { path: '/hearthstone/card', component: () => import('./pages/hearthstone/card/index.vue') },
    { path: '/hearthstone/set', component: () => import('./pages/hearthstone/set/index.vue') },
    { path: '/hearthstone/tag', component: () => import('./pages/hearthstone/tag/index.vue') },
    { path: '/hearthstone/format', component: () => import('./pages/hearthstone/format/index.vue') },
    { path: '/hearthstone/data-source', component: () => import('./pages/hearthstone/data-source/index.vue') },
    { path: '/hearthstone/data-import', component: () => import('./pages/hearthstone/data-import/index.vue') },
    { path: '/hearthstone/image', component: () => import('./pages/hearthstone/image/index.vue') },
  ],
});

export default router;

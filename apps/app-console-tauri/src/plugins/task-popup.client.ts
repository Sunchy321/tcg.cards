import { markRaw } from 'vue';

import GlobalTaskPopup from '~/components/GlobalTaskPopup.vue';

/** Provides the global task popup component to the admin layout's header-right injection point. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.provide('admin-header-right', markRaw(GlobalTaskPopup));
});
